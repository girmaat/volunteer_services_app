/**
 * Account self-service: data export (everything we hold about you, as JSON), account deletion
 * (anonymize + sign out everywhere), attendance confirmation and the impact CSV.
 */
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import type { PolicyUser } from "../../lib/policy";
import { requireAuthedUser, requireVolunteerUser } from "../../middleware/auth";
import { transitionRequest, TransitionError } from "../requests/lifecycle";
import { afterApplicationUpdate } from "../requests/applications";
import { recordCommitmentCancel } from "../reviews/service";
import { notify, requestOwnerIds } from "../notifications/service";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralize spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function registerAccountRoutes(app: Express) {
  app.get(
    "/v1/me/export",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const q = async (sql: string) => (await pool.query(sql, [user.id])).rows;
      const data = {
        exported_at: new Date().toISOString(),
        account: (await q("SELECT id, email, email_verified_at, created_at, verification_status, onboarding_completed FROM users WHERE id = $1"))[0],
        roles: await q("SELECT role, created_at FROM user_roles WHERE user_id = $1"),
        profile: (await q("SELECT * FROM user_profiles WHERE user_id = $1"))[0] ?? null,
        availability: (await q("SELECT * FROM user_availability WHERE user_id = $1"))[0] ?? null,
        privacy: (await q("SELECT * FROM user_privacy_settings WHERE user_id = $1"))[0] ?? null,
        organizations: await q("SELECT org_slug, role, status, joined_at FROM organization_members WHERE user_id = $1"),
        requests_posted: await q("SELECT id, title, description, status, category, public_area, exact_address, starts_at, created_at FROM service_requests WHERE requester_user_id = $1"),
        applications: await q("SELECT a.id, a.request_id, r.title, a.status, a.message, a.created_at FROM request_applications a JOIN service_requests r ON r.id = a.request_id WHERE a.volunteer_user_id = $1"),
        commitments: await q("SELECT request_id, status, start_at, end_at, late_cancel, no_show FROM request_commitments WHERE volunteer_user_id = $1"),
        messages_sent: await q("SELECT conversation_id, body, status, created_at FROM direct_messages WHERE sender_user_id = $1"),
        messages_received: await q("SELECT conversation_id, body, created_at FROM direct_messages WHERE recipient_user_id = $1 AND status = 'sent'"),
        reviews_given: [
          ...(await q("SELECT 'volunteer' AS about, rating, comment, created_at FROM volunteer_reviews WHERE reviewer_user_id = $1")),
          ...(await q("SELECT 'requester' AS about, rating, comment, created_at FROM requester_reviews WHERE reviewer_user_id = $1"))
        ],
        reviews_received: [
          ...(await q("SELECT rating, comment, visible_at FROM visible_volunteer_reviews WHERE volunteer_user_id = $1")),
          ...(await q("SELECT rating, comment, visible_at FROM visible_requester_reviews WHERE requester_user_id = $1"))
        ],
        impact: {
          hours: await q("SELECT impact_date, hours, notes FROM volunteer_impact_entries WHERE volunteer_user_id = $1"),
          tasks: await q("SELECT task_date, task, duration_hours FROM volunteer_task_entries WHERE volunteer_user_id = $1"),
          outcomes: await q("SELECT outcome_date, outcome, quantity, unit FROM volunteer_outcome_entries WHERE volunteer_user_id = $1")
        },
        notifications: await q("SELECT type, title, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500"),
        notification_preferences: await q("SELECT type, email, in_app FROM notification_preferences WHERE user_id = $1"),
        reports_filed: await q("SELECT category, details, status, created_at FROM user_reports WHERE reporter_user_id = $1"),
        blocks: await q("SELECT created_at FROM user_blocks WHERE blocker_user_id = $1")
      };
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename="thankyou-data-${new Date().toISOString().slice(0, 10)}.json"`);
      res.setHeader("cache-control", "private, no-store");
      return res.send(JSON.stringify(data, null, 2));
    })
  );

  // Deleting an account removes personal data and signs out everywhere. Shared history (messages
  // other people received, reviews) stays with the name "Deleted member".
  app.post(
    "/v1/me/delete",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const p = z.object({ password: z.string().min(1), confirm: z.literal("DELETE") }).safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Type DELETE and your password to confirm" });
      const row = (await pool.query("SELECT password_hash FROM users WHERE id = $1", [user.id])).rows[0];
      if (!row?.password_hash || !(await bcrypt.compare(p.data.password, row.password_hash))) return res.status(403).json({ message: "That password isn't right" });
      const sole = await pool.query(
        `SELECT m.org_slug FROM organization_members m WHERE m.user_id = $1 AND m.role = 'admin' AND m.status = 'active'
            AND NOT EXISTS (SELECT 1 FROM organization_members o WHERE o.org_slug = m.org_slug AND o.role = 'admin' AND o.status = 'active' AND o.user_id <> $1)`,
        [user.id]
      );
      if (sole.rowCount) return res.status(409).json({ message: `Make someone else an admin of ${sole.rows.map((r) => r.org_slug).join(", ")} first` });

      // Close what's in progress so nobody waits on a deleted account.
      const live = await pool.query("SELECT id FROM service_requests WHERE requester_user_id = $1 AND requester_org_slug IS NULL AND status IN ('draft','open','pending','filled','paused')", [user.id]);
      for (const r of live.rows) {
        try {
          await transitionRequest(String(r.id), "cancel", { userId: user.id, kind: "user" }, { reason: "The requester closed their account" });
        } catch (e) {
          if (!(e instanceof TransitionError)) throw e;
        }
      }
      const apps = await pool.query("SELECT id, status, request_id FROM request_applications WHERE volunteer_user_id = $1 AND status IN ('pending','waitlisted','accepted','confirmed')", [user.id]);
      for (const a of apps.rows) {
        if (a.status === "accepted" || a.status === "confirmed") await recordCommitmentCancel(String(a.id), "system");
        await pool.query("UPDATE request_applications SET status = $2, updated_at = NOW() WHERE id = $1", [a.id, a.status === "accepted" || a.status === "confirmed" ? "canceled" : "withdrawn"]);
        await afterApplicationUpdate(String(a.id), "canceled", null);
        for (const owner of await requestOwnerIds(String(a.request_id))) {
          if (a.status === "accepted" || a.status === "confirmed") await notify(owner, "request_updates", { title: "A volunteer closed their account", href: "/dashboard" });
        }
      }
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          `UPDATE users SET email = 'deleted+' || id || '@deleted.invalid', password_hash = '!deleted', email_verified_at = NULL, deleted_at = NOW(),
                  banned_until = 'infinity', banned_reason = 'Account deleted', updated_at = NOW() WHERE id = $1`,
          [user.id]
        );
        await c.query(
          `UPDATE user_profiles SET full_name = NULL, phone = NULL, display_name = 'Deleted member', avatar_url = NULL, public_location = NULL,
                  location = NULL, bio = NULL, birth_year = NULL, geo_lat = NULL, geo_lng = NULL, experience = NULL WHERE user_id = $1`,
          [user.id]
        );
        for (const t of ["sessions", "user_roles", "notification_preferences", "notifications", "user_availability", "verification_documents", "password_reset_tokens", "email_verification_tokens"]) {
          await c.query(`DELETE FROM ${t} WHERE user_id = $1`, [user.id]);
        }
        await c.query("DELETE FROM organization_members WHERE user_id = $1", [user.id]);
        await c.query("UPDATE platform_admins SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [user.id]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      return res.json({ deleted: true });
    })
  );

  // U8: "I'm still coming" from the reminder.
  app.post(
    "/v1/volunteer/applications/:id/confirm-attendance",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const a = (await pool.query("SELECT a.id, a.status, a.request_id, r.starts_at, r.ends_at FROM request_applications a JOIN service_requests r ON r.id = a.request_id WHERE a.id = $1 AND a.volunteer_user_id = $2", [id.data, user.id])).rows[0];
      if (!a) return res.status(404).json({ message: "Application not found" });
      if (!["accepted", "confirmed"].includes(a.status)) return res.status(409).json({ message: "Only accepted volunteers confirm attendance" });
      const up = await pool.query(
        "UPDATE request_commitments SET volunteer_confirmed_at = NOW(), updated_at = NOW() WHERE request_id = $1 AND volunteer_user_id = $2 AND status IN ('scheduled','confirmed') RETURNING id",
        [a.request_id, user.id]
      );
      if (!up.rowCount) {
        if (!a.starts_at) return res.status(409).json({ message: "There's no date to confirm yet" });
        await pool.query(
          "INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, end_at, volunteer_confirmed_at) VALUES ($1, $2, 'scheduled', $3, $4, NOW())",
          [user.id, a.request_id, a.starts_at, a.ends_at]
        );
      }
      return res.json({ confirmed: true });
    })
  );

  // U10: impact export.
  app.get(
    "/v1/volunteer/history/export.csv",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const r = await pool.query(
        `SELECT 'hours' AS kind, i.impact_date AS date, r.title AS request, i.hours AS hours, i.notes AS detail, NULL::text AS quantity
           FROM volunteer_impact_entries i LEFT JOIN service_requests r ON r.id = i.request_id WHERE i.volunteer_user_id = $1
         UNION ALL
         SELECT 'task', t.task_date, r.title, t.duration_hours, t.task, NULL FROM volunteer_task_entries t LEFT JOIN service_requests r ON r.id = t.request_id WHERE t.volunteer_user_id = $1
         UNION ALL
         SELECT 'outcome', o.outcome_date, r.title, NULL, o.outcome, CONCAT(o.quantity, ' ', o.unit) FROM volunteer_outcome_entries o LEFT JOIN service_requests r ON r.id = o.request_id WHERE o.volunteer_user_id = $1
         UNION ALL
         SELECT 'completed', a.completed_at::date, r.title,
                ROUND((EXTRACT(EPOCH FROM (c.end_at - c.start_at)) / 3600)::numeric, 2), NULL, NULL
           FROM request_applications a JOIN service_requests r ON r.id = a.request_id
           LEFT JOIN request_commitments c ON c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id
          WHERE a.volunteer_user_id = $1 AND a.status = 'completed'
         ORDER BY date DESC NULLS LAST`,
        [user.id]
      );
      const lines = [["type", "date", "request", "hours", "detail", "quantity"].map(csvCell).join(",")];
      for (const row of r.rows) lines.push([row.kind, row.date ? new Date(row.date).toISOString().slice(0, 10) : "", row.request, row.hours, row.detail, row.quantity].map(csvCell).join(","));
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", 'attachment; filename="thankyou-impact.csv"');
      return res.send("﻿" + lines.join("\r\n"));
    })
  );
}
