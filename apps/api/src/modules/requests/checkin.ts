/**
 * QR check-in (CON-04): staff show a per-request code on site; a volunteer who was accepted scans it
 * with their own signed-in phone to check in and out. It works only around the shift, only when
 * prerequisites are cleared, and never uses location. Staff can rotate the code; staff check-in and
 * manual entry stay available when scanning isn't practical.
 */
import crypto from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { wrap } from "../../lib/http";
import { requireVolunteerUser } from "../../middleware/auth";
import { contributionFromAttendance } from "../contributions/service";
import { outstanding, prerequisites } from "../prerequisites/service";
import { loadOwned } from "./routes";

const url = (token: string) => `${env.WEB_BASE_URL.replace(/\/$/, "")}/check-in/${token}`;
const EARLY_MS = 2 * 3_600_000;
const LATE_MS = 4 * 3_600_000;

/** Whether "now" is close enough to the shift. Recurring and flexible requests can check in any day. */
export function inWindow(r: { schedule_type: string; starts_at: string | null; ends_at: string | null; duration_minutes: number | null }, now = new Date()) {
  if (r.schedule_type !== "one_time" || !r.starts_at) return { ok: true as const };
  const start = new Date(r.starts_at).getTime();
  const end = r.ends_at ? new Date(r.ends_at).getTime() : start + (Number(r.duration_minutes) || 60) * 60_000;
  if (now.getTime() < start - EARLY_MS) return { ok: false as const, message: "Check-in opens 2 hours before the shift starts." };
  if (now.getTime() > end + LATE_MS) return { ok: false as const, message: "Check-in for this shift has closed. Ask the organizer to record your time." };
  return { ok: true as const };
}

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const r = await pool.query(
    `SELECT r.id, r.title, r.requester_org_slug, r.schedule_type, r.starts_at, r.ends_at, r.duration_minutes, r.timezone, r.public_area, r.mode, r.status, o.name AS org_name
       FROM service_requests r LEFT JOIN organizations o ON o.slug = r.requester_org_slug WHERE r.checkin_token = $1`,
    [token]
  );
  return r.rows[0] ?? null;
}

async function myState(userId: string, r: Record<string, any>) {
  const a = (await pool.query("SELECT id, status FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 ORDER BY created_at DESC LIMIT 1", [r.id, userId])).rows[0] ?? null;
  const open = (await pool.query("SELECT id, check_in_at FROM org_attendance_logs WHERE request_id = $1 AND volunteer_user_id = $2 AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1", [r.id, userId])).rows[0] ?? null;
  const pre = await prerequisites(userId, String(r.id));
  const window = inWindow(r as Parameters<typeof inWindow>[0]);
  return { application: a, checked_in_at: open?.check_in_at ?? null, open_log_id: open?.id ?? null, prerequisites: pre, window };
}

export function registerCheckinRoutes(app: Express) {
  // Staff: get (or rotate) the request's check-in code.
  app.post(
    "/v1/requests/:id/checkin-code",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id, { manage: true });
      if (!owned) return;
      if (!owned.row.requester_org_slug) return res.status(409).json({ message: "Check-in codes are for organization requests" });
      const rotate = req.body?.rotate === true;
      let token = owned.row.checkin_token as string | null;
      if (!token || rotate) {
        token = crypto.randomBytes(18).toString("base64url");
        await pool.query("UPDATE service_requests SET checkin_token = $2 WHERE id = $1", [owned.row.id, token]);
      }
      return res.json({ token, url: url(token), rotated: rotate });
    })
  );

  app.get(
    "/v1/checkin/:token",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const r = await byToken(String(req.params.token || ""));
      if (!r) return res.status(404).json({ message: "This check-in code isn't valid. Ask the organizer for the current one." });
      const s = await myState(user.id, r);
      return res.json({ request: { id: r.id, title: r.title, org_name: r.org_name, starts_at: r.starts_at, ends_at: r.ends_at, timezone: r.timezone, public_area: r.public_area }, ...s });
    })
  );

  app.post(
    "/v1/checkin/:token",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const body = z.object({ action: z.enum(["in", "out"]) }).safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ message: "Check in or check out?" });
      const r = await byToken(String(req.params.token || ""));
      if (!r) return res.status(404).json({ message: "This check-in code isn't valid. Ask the organizer for the current one." });
      const s = await myState(user.id, r);
      if (!s.application || !["accepted", "confirmed", "completed"].includes(String(s.application.status))) {
        return res.status(403).json({ error: { code: "not_assigned", message: "You aren't signed up for this shift." }, message: "You aren't signed up for this shift." });
      }
      if (body.data.action === "in") {
        if (!["open", "pending", "filled", "paused"].includes(String(r.status))) return res.status(409).json({ message: "This request isn't active" });
        if (!s.window.ok) return res.status(409).json({ error: { code: "outside_window", message: s.window.message }, message: s.window.message });
        if (s.prerequisites.status !== "cleared") {
          const m = outstanding(s.prerequisites);
          return res.status(409).json({ error: { code: `prerequisites_${s.prerequisites.status}`, message: m }, message: m, prerequisites: s.prerequisites });
        }
        if (s.open_log_id) return res.status(409).json({ message: "You're already checked in" });
        const ins = await pool.query(
          `INSERT INTO org_attendance_logs (org_slug, request_id, request_application_id, volunteer_user_id, check_in_at, method, created_by_user_id)
           VALUES ($1, $2, $3, $4, NOW(), 'qr', $4) RETURNING check_in_at`,
          [r.requester_org_slug, r.id, s.application.id, user.id]
        );
        return res.status(201).json({ checked_in_at: ins.rows[0].check_in_at });
      }
      if (!s.open_log_id) return res.status(409).json({ message: "You aren't checked in" });
      await pool.query(
        "UPDATE org_attendance_logs SET check_out_at = NOW(), hours = ROUND(EXTRACT(EPOCH FROM (NOW() - check_in_at)) / 3600.0, 2), updated_at = NOW() WHERE id = $1",
        [s.open_log_id]
      );
      const contributionId = await contributionFromAttendance(String(s.open_log_id), "qr_check_in", user.id);
      return res.json({ checked_out: true, contribution_id: contributionId });
    })
  );
}
