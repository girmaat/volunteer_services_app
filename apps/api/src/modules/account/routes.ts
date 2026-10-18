/**
 * Account self-service: data export (everything we hold about you, as JSON), account deletion
 * (anonymize + sign out everywhere), attendance confirmation and the impact CSV.
 */
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../../lib/db";
import { METHOD_LABEL, type Method } from "../contributions/service";
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
        // Hours as reviewed by organizations, with every decision (the record of service).
        contributions: await q(
          `SELECT c.id, c.request_id, r.title AS request_title, c.org_slug, c.source, c.started_at, c.ended_at, c.break_minutes, c.reported_hours::float, c.reported_units::float,
                  c.unit, c.approved_hours::float, c.approved_units::float, c.status, c.verification_method, c.description, c.decided_at, c.created_at
             FROM contributions c LEFT JOIN service_requests r ON r.id = c.request_id WHERE c.volunteer_user_id = $1 ORDER BY c.created_at`
        ),
        contribution_decisions: await q(
          `SELECT d.contribution_id, d.actor_role, d.action, d.hours::float, d.units::float, d.reason, d.created_at
             FROM contribution_decisions d JOIN contributions c ON c.id = d.contribution_id WHERE c.volunteer_user_id = $1 ORDER BY d.created_at`
        ),
        service_records: await q(
          "SELECT id, name_mode, contribution_ids, snapshot, issued_at, expires_at, revoked_at, replaced_by_id, superseded_at, view_count, last_viewed_at FROM service_records WHERE volunteer_user_id = $1 ORDER BY issued_at"
        ),
        guardian_consents: await q(
          "SELECT request_id, guardian_name, guardian_email, relationship, status, signed_name, requested_at, responded_at, expires_at FROM guardian_consents WHERE volunteer_user_id = $1 ORDER BY requested_at"
        ),
        signed_documents: await q(
          `SELECT k.org_document_id, d.org_slug, COALESCE(k.presented_title, d.title) AS title, k.request_id, k.document_version, k.sha256, k.signer_name, k.signature_method, k.acknowledged_at
             FROM volunteer_document_acks k LEFT JOIN org_documents d ON d.id = k.org_document_id WHERE k.volunteer_user_id = $1 ORDER BY k.acknowledged_at`
        ),
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
      const apps = await pool.query("SELECT id, status, request_id FROM request_applications WHERE volunteer_user_id = $1 AND status IN ('pending','waitlisted','offered','accepted','confirmed')", [user.id]);
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
        // Shared service records stop verifying, and their stored copy loses the person's name.
        await c.query(
          `UPDATE service_records SET revoked_at = COALESCE(revoked_at, NOW()),
                  snapshot = jsonb_set(snapshot, '{volunteer_name}', '"Deleted member"'::jsonb, true)
            WHERE volunteer_user_id = $1`,
          [user.id]
        );
        await c.query("UPDATE guardian_consents SET status = 'replaced', responded_at = NOW() WHERE volunteer_user_id = $1 AND status = 'pending'", [user.id]);
        await c.query("UPDATE user_profiles SET birth_date = NULL WHERE user_id = $1", [user.id]);
        await c.query("DELETE FROM organization_members WHERE user_id = $1", [user.id]);
        await c.query("UPDATE profile_share_links SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [user.id]);
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
      // One row per contribution, with its status, so self-reported, waiting and approved service
      // are never mixed (PRIV-02, OPS-05). Units stay in their own columns.
      const rows = await pool.query(
        `SELECT COALESCE(c.started_at, c.created_at) AS date, COALESCE(r.title, '') AS activity,
                COALESCE(o.name, CASE WHEN r.id IS NOT NULL AND r.requester_org_slug IS NULL THEN 'Individual request' END, '') AS org,
                c.status, c.reported_hours::float AS reported_hours, c.approved_hours::float AS approved_hours, c.reported_units::float AS reported_units,
                c.approved_units::float AS approved_units, c.unit, c.verification_method, c.decided_by_role, c.description,
                (SELECT d.reason FROM contribution_decisions d WHERE d.contribution_id = c.id AND d.reason IS NOT NULL
                    AND d.action IN ('adjusted', 'rejected', 'revision_requested', 'corrected', 'disputed', 'marked_unverified', 'dispute_upheld')
                  ORDER BY d.created_at DESC LIMIT 1) AS reason
           FROM contributions c LEFT JOIN service_requests r ON r.id = c.request_id LEFT JOIN organizations o ON o.slug = c.org_slug
          WHERE c.volunteer_user_id = $1 ORDER BY 1 DESC`,
        [user.id]
      );
      const STATUS: Record<string, string> = { approved: "approved", adjusted: "approved (adjusted)", pending: "waiting for approval", revision_requested: "sent back", disputed: "disputed", rejected: "not approved", unverified: "unverifiable", self_reported: "self-reported" };
      const d = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : "");
      const lines = [["date", "activity", "organization", "status", "reported_hours", "approved_hours", "reported_units", "approved_units", "unit", "verified_by", "approver_role", "note"].map(csvCell).join(",")];
      for (const c of rows.rows) {
        lines.push(
          [d(c.date), c.activity, c.org, STATUS[c.status] ?? c.status, c.reported_hours ?? "", c.approved_hours ?? "", c.reported_units ?? "", c.approved_units ?? "", c.unit ?? "", METHOD_LABEL[c.verification_method as Method] ?? "", c.decided_by_role ?? "", [c.description, c.reason].filter(Boolean).join(" | ")]
            .map(csvCell)
            .join(",")
        );
      }
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", 'attachment; filename="thankyou-impact.csv"');
      return res.send("﻿" + lines.join("\r\n"));
    })
  );
}
