/**
 * Phase 4.9 admin minimum: sensitive-request review queue, take-down/restore, held-message queue,
 * disputes, shadow-ban, platform metrics and the audit log. Moderators can work every queue here;
 * shadow-banning and the audit log need a platform admin.
 */
import type { Express, Response } from "express";
import { z } from "zod";
import { requireModerator, requirePlatformAdmin } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { transitionRequest, TransitionError } from "../requests/lifecycle";
import { deliver, loadConversation } from "../messaging/service";
import { notify } from "../notifications/service";
import { parseLimit, parseOffset } from "./helpers";

const uuid = z.string().uuid();

function transitionError(res: Response, e: unknown) {
  if (e instanceof TransitionError) return res.status(e.status).json({ error: { code: e.code, message: e.message }, message: e.message });
  throw e;
}

export function registerAdminQueueRoutes(app: Express) {
  // ---- Sensitive requests waiting for review (per category) -------------------------------------
  app.get(
    "/v1/admin/review-queue",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const category = typeof req.query.category === "string" ? req.query.category : null;
      const r = await pool.query(
        `SELECT r.id, r.title, r.description, r.category, c.label AS category_label, r.mode, r.public_area, r.starts_at, r.updated_at,
                r.requester_org_slug, o.name AS org_name, COALESCE(NULLIF(p.display_name,''), 'Member') AS requester_name,
                u.verification_status, (o.verification_status IN ('approved','verified')) AS org_verified,
                (SELECT COUNT(*)::int FROM user_reports ur WHERE ur.target_user_id = r.requester_user_id) AS reports_against
           FROM service_requests r
           JOIN request_categories c ON c.slug = r.category
           JOIN users u ON u.id = r.requester_user_id
           LEFT JOIN user_profiles p ON p.user_id = r.requester_user_id
           LEFT JOIN organizations o ON o.slug = r.requester_org_slug
          WHERE r.review_status = 'pending_review' AND ($1::text IS NULL OR r.category = $1)
          ORDER BY r.updated_at ASC`,
        [category]
      );
      const counts = await pool.query(
        `SELECT r.category, c.label, COUNT(*)::int AS n FROM service_requests r JOIN request_categories c ON c.slug = r.category
          WHERE r.review_status = 'pending_review' GROUP BY r.category, c.label ORDER BY c.label`
      );
      return res.json({ items: r.rows, categories: counts.rows });
    })
  );

  app.post(
    "/v1/admin/requests/:id/review",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ decision: z.enum(["approve", "reject"]), notes: z.string().trim().max(1000).optional() }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Invalid request" });
      if (body.data.decision === "reject" && !body.data.notes) return res.status(422).json({ message: "Tell the poster what to change" });
      try {
        const out = await transitionRequest(id.data, body.data.decision, { userId: String(m.user.id), kind: "admin" }, { reason: body.data.notes ?? null });
        res.locals.audit = { action: `request.${body.data.decision}`, targetType: "request", targetId: id.data, details: { notes: body.data.notes ?? null } };
        return res.json(out);
      } catch (e) {
        return transitionError(res, e);
      }
    })
  );

  app.post(
    "/v1/admin/requests/:id/take-down",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse(req.body ?? {});
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      if (!body.success) return res.status(422).json({ message: "Give the reason the poster will see" });
      try {
        const out = await transitionRequest(id.data, "take_down", { userId: String(m.user.id), kind: "admin" }, { reason: body.data.reason });
        res.locals.audit = { action: "request.take_down", targetType: "request", targetId: id.data, details: { reason: body.data.reason } };
        return res.json(out);
      } catch (e) {
        return transitionError(res, e);
      }
    })
  );

  app.post(
    "/v1/admin/requests/:id/restore",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const id = uuid.safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      try {
        const out = await transitionRequest(id.data, "restore", { userId: String(m.user.id), kind: "admin" });
        res.locals.audit = { action: "request.restore", targetType: "request", targetId: id.data };
        return res.json(out);
      } catch (e) {
        return transitionError(res, e);
      }
    })
  );

  // ---- Messages held by the link/keyword filter ---------------------------------------------------
  app.get(
    "/v1/admin/messages/held",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const r = await pool.query(
        `SELECT d.id, d.body, d.held_reason, d.created_at, d.conversation_id, r.title AS request_title,
                COALESCE(NULLIF(sp.display_name,''), 'Member') AS sender_name, d.sender_user_id,
                (SELECT COUNT(*)::int FROM direct_messages x WHERE x.sender_user_id = d.sender_user_id AND x.status = 'rejected') AS sender_rejected_before
           FROM direct_messages d
           LEFT JOIN service_requests r ON r.id = d.request_id
           LEFT JOIN user_profiles sp ON sp.user_id = d.sender_user_id
          WHERE d.status = 'held' ORDER BY d.created_at ASC LIMIT 200`
      );
      return res.json({ items: r.rows });
    })
  );

  app.post(
    "/v1/admin/messages/:id/decide",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ decision: z.enum(["release", "reject"]) }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Invalid request" });
      const r = await pool.query(
        `UPDATE direct_messages SET status = $2, reviewed_by_user_id = $3, reviewed_at = NOW() WHERE id = $1 AND status = 'held' RETURNING conversation_id, sender_user_id`,
        [id.data, body.data.decision === "release" ? "sent" : "rejected", m.user.id]
      );
      if (!r.rowCount) return res.status(404).json({ message: "No held message with that id" });
      if (body.data.decision === "release" && r.rows[0].conversation_id) {
        const c = await loadConversation(String(r.rows[0].conversation_id));
        if (c) await deliver(c, id.data);
      }
      res.locals.audit = { action: `message.${body.data.decision}`, targetType: "message", targetId: id.data };
      return res.json({ status: body.data.decision === "release" ? "sent" : "rejected" });
    })
  );

  // ---- Disputes about reviews, no-shows and late cancellations ------------------------------------
  app.get(
    "/v1/admin/disputes",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const status = typeof req.query.status === "string" ? req.query.status : "open";
      const r = await pool.query(
        `SELECT d.*, r.title AS request_title,
                COALESCE(NULLIF(op.display_name,''), 'Member') AS opened_by_name, COALESCE(NULLIF(ap.display_name,''), 'Member') AS against_name,
                c.no_show, c.late_cancel, c.start_at,
                CASE d.review_table WHEN 'volunteer_reviews' THEN (SELECT row_to_json(v) FROM (SELECT rating, comment, strengths FROM volunteer_reviews WHERE id = d.review_id) v)
                                    WHEN 'requester_reviews' THEN (SELECT row_to_json(v) FROM (SELECT rating, comment, strengths FROM requester_reviews WHERE id = d.review_id) v) END AS review
           FROM disputes d
           LEFT JOIN service_requests r ON r.id = d.request_id
           LEFT JOIN user_profiles op ON op.user_id = d.opened_by_user_id
           LEFT JOIN user_profiles ap ON ap.user_id = d.against_user_id
           LEFT JOIN request_applications a ON a.id = d.application_id
           LEFT JOIN request_commitments c ON c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id
          WHERE ($1 = 'all' OR d.status = $1)
          ORDER BY d.created_at ASC LIMIT 200`,
        [status]
      );
      return res.json({ items: r.rows });
    })
  );

  app.post(
    "/v1/admin/disputes/:id/decide",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ status: z.enum(["upheld", "overturned", "dismissed"]), notes: z.string().trim().min(3).max(2000) }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Pick a decision and explain it" });
      const d = (await pool.query("SELECT * FROM disputes WHERE id = $1", [id.data])).rows[0];
      if (!d) return res.status(404).json({ message: "Dispute not found" });
      if (d.status !== "open") return res.status(409).json({ message: "This dispute was already decided" });
      if (body.data.status === "overturned") {
        // Overturning removes the contested record.
        if (d.kind === "review" && d.review_table && d.review_id) {
          await pool.query(`UPDATE ${d.review_table === "volunteer_reviews" ? "volunteer_reviews" : "requester_reviews"} SET removed_at = NOW(), removed_reason = $2 WHERE id = $1`, [
            d.review_id,
            body.data.notes
          ]);
        }
        if (d.kind === "no_show" || d.kind === "late_cancel") {
          await pool.query(
            `UPDATE request_commitments c SET ${d.kind === "no_show" ? "no_show" : "late_cancel"} = FALSE, updated_at = NOW()
               FROM request_applications a WHERE a.id = $1 AND c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id`,
            [d.application_id]
          );
        }
      }
      await pool.query("UPDATE disputes SET status = $2, decision_notes = $3, decided_by_user_id = $4, decided_at = NOW() WHERE id = $1", [
        id.data,
        body.data.status,
        body.data.notes,
        m.user.id
      ]);
      for (const uid of [d.opened_by_user_id, d.against_user_id].filter(Boolean)) {
        await notify(String(uid), "disputes", {
          title: `Dispute ${body.data.status === "overturned" ? "resolved: record removed" : body.data.status === "upheld" ? "resolved: record stands" : "closed"}`,
          body: body.data.notes,
          href: d.application_id ? (uid === d.opened_by_user_id ? `/volunteer/applications/${d.application_id}` : "/settings") : "/settings",
          email: { subject: "Your dispute was reviewed", heading: "A moderator reviewed the dispute", lines: [`Decision: ${body.data.status}.`, `Notes: ${body.data.notes}`] }
        });
      }
      res.locals.audit = { action: `dispute.${body.data.status}`, targetType: "dispute", targetId: id.data, details: { kind: d.kind, notes: body.data.notes } };
      return res.json({ id: id.data, status: body.data.status });
    })
  );

  // ---- Shadow-ban: content stays visible only to its author --------------------------------------
  app.post(
    "/v1/admin/users/:id/shadow-ban",
    wrap(async (req, res) => {
      const a = await requirePlatformAdmin(pool, req, res);
      if (!a) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ on: z.boolean(), reason: z.string().trim().max(500).optional() }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Invalid request" });
      if (id.data === String(a.user.id)) return res.status(409).json({ message: "You can't shadow-ban yourself" });
      const r = await pool.query("UPDATE users SET shadow_banned = $2, updated_at = NOW() WHERE id = $1 RETURNING id", [id.data, body.data.on]);
      if (!r.rowCount) return res.status(404).json({ message: "User not found" });
      res.locals.audit = { action: body.data.on ? "user.shadow_ban" : "user.shadow_unban", targetType: "user", targetId: id.data, details: { reason: body.data.reason ?? null } };
      return res.json({ id: id.data, shadow_banned: body.data.on });
    })
  );

  // ---- Background check status (recorded after an admin reviews documents) -----------------------
  app.post(
    "/v1/admin/users/:id/background-check",
    wrap(async (req, res) => {
      const a = await requirePlatformAdmin(pool, req, res);
      if (!a) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ status: z.enum(["none", "pending", "cleared", "expired"]) }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Invalid request" });
      const r = await pool.query(
        `INSERT INTO user_profiles (user_id, background_check_status, background_check_updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET background_check_status = $2, background_check_updated_at = NOW() RETURNING user_id`,
        [id.data, body.data.status]
      );
      res.locals.audit = { action: "user.background_check", targetType: "user", targetId: id.data, details: { status: body.data.status } };
      return res.json({ id: r.rows[0].user_id, background_check_status: body.data.status });
    })
  );

  // ---- Categories (enable/disable, tiers) --------------------------------------------------------
  app.get(
    "/v1/admin/categories",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const r = await pool.query("SELECT * FROM request_categories ORDER BY sort, label");
      return res.json({ categories: r.rows });
    })
  );

  app.patch(
    "/v1/admin/categories/:slug",
    wrap(async (req, res) => {
      const a = await requirePlatformAdmin(pool, req, res);
      if (!a) return;
      const body = z
        .object({ enabled: z.boolean().optional(), min_post_tier: z.enum(["basic", "trusted"]).optional(), min_apply_tier: z.enum(["basic", "trusted"]).optional() })
        .strict()
        .safeParse(req.body ?? {});
      if (!body.success || !Object.keys(body.data).length) return res.status(400).json({ message: "Invalid payload" });
      const r = await pool.query(
        `UPDATE request_categories SET enabled = COALESCE($2, enabled), min_post_tier = COALESCE($3, min_post_tier), min_apply_tier = COALESCE($4, min_apply_tier), updated_at = NOW()
          WHERE slug = $1 RETURNING *`,
        [String(req.params.slug), body.data.enabled ?? null, body.data.min_post_tier ?? null, body.data.min_apply_tier ?? null]
      );
      if (!r.rowCount) return res.status(404).json({ message: "Category not found" });
      res.locals.audit = { action: "category.update", targetType: "category", targetId: String(req.params.slug), details: body.data };
      return res.json(r.rows[0]);
    })
  );

  // ---- Metrics: post volume and fill rate --------------------------------------------------------
  app.get(
    "/v1/admin/metrics",
    wrap(async (req, res) => {
      const m = await requireModerator(pool, req, res);
      if (!m) return;
      const weekly = await pool.query(
        `WITH weeks AS (SELECT generate_series(date_trunc('week', NOW()) - INTERVAL '11 weeks', date_trunc('week', NOW()), INTERVAL '1 week') AS wk)
         SELECT to_char(w.wk, 'YYYY-MM-DD') AS week,
                COUNT(r.id)::int AS posted,
                COUNT(r.id) FILTER (WHERE r.filled_at IS NOT NULL OR r.status IN ('filled','completed'))::int AS filled
           FROM weeks w LEFT JOIN service_requests r ON date_trunc('week', r.published_at) = w.wk
          GROUP BY w.wk ORDER BY w.wk`
      );
      const totals = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '30 days')::int AS posted_30d,
           COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '30 days' AND (filled_at IS NOT NULL OR status IN ('filled','completed')))::int AS filled_30d,
           COUNT(*) FILTER (WHERE status IN ('open','pending'))::int AS live_now,
           COUNT(*) FILTER (WHERE review_status = 'pending_review')::int AS awaiting_review,
           (SELECT COUNT(*)::int FROM direct_messages WHERE status = 'held') AS held_messages,
           (SELECT COUNT(*)::int FROM disputes WHERE status = 'open') AS open_disputes,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_app - published_at)) / 3600)
              FROM (SELECT r.published_at, MIN(a.created_at) AS first_app FROM service_requests r JOIN request_applications a ON a.request_id = r.id
                     WHERE r.published_at > NOW() - INTERVAL '30 days' GROUP BY r.id) t) AS median_hours_to_first_applicant
         FROM service_requests`
      );
      const t = totals.rows[0];
      return res.json({
        ...t,
        fill_rate_30d: t.posted_30d ? Math.round((100 * t.filled_30d) / t.posted_30d) : null,
        weekly: weekly.rows
      });
    })
  );

  // ---- Audit log ---------------------------------------------------------------------------------
  app.get(
    "/v1/admin/audit-log",
    wrap(async (req, res) => {
      const a = await requirePlatformAdmin(pool, req, res);
      if (!a) return;
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);
      const target = typeof req.query.target === "string" ? req.query.target : null;
      const r = await pool.query(
        `SELECT l.id, l.action, l.method, l.path, l.target_type, l.target_id, l.details, l.status_code, l.created_at, l.actor_role,
                u.email AS actor_email
           FROM admin_audit_log l LEFT JOIN users u ON u.id = l.actor_user_id
          WHERE ($1::text IS NULL OR l.target_id = $1)
          ORDER BY l.created_at DESC LIMIT $2 OFFSET $3`,
        [target, limit, offset]
      );
      return res.json({ items: r.rows, limit, offset });
    })
  );
}
