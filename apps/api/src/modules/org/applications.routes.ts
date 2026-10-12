import type { Express } from "express";
import { z } from "zod";
import { contributionFromAttendance } from "../contributions/service";
import { minorSql } from "../../lib/age";
import { outstanding, prerequisites } from "../prerequisites/service";
import { pool } from "../../lib/db";
import { acceptError, afterApplicationUpdate, checkAccept } from "../requests/applications";
import { wrap } from "../../lib/http";
import { contactsFor, requireAdminOrManager, requireOrg } from "./context";

export function registerOrgApplicationsRoutes(app: Express) {

  // Phase 4.2: Org Applications pipeline
  app.get(
    "/v1/org/applications",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          status: z.string().optional(),
          requestId: z.string().uuid().optional()
        })
        .safeParse(req.query);

      const status = q.success && q.data.status ? String(q.data.status) : null;
      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;

      const rows = await pool.query(
        `
        SELECT
          a.id AS application_id,
          a.status,
          CASE WHEN a.status IN ('accepted','confirmed','completed') THEN a.message ELSE mask_contacts(a.message) END AS message,
          a.created_at,
          a.updated_at,
          a.assigned_to_user_id,
          r.id AS request_id,
          r.title AS request_title,
          v.id AS volunteer_user_id,
          CASE WHEN a.status IN ('accepted','confirmed','completed') AND NOT ${minorSql("a.volunteer_user_id")} THEN v.email END AS volunteer_email,
          ${minorSql("a.volunteer_user_id")} AS volunteer_minor,
          vp.display_name AS volunteer_display_name,
          vp.avatar_url AS volunteer_avatar_url,
          COALESCE(vp.public_location, vp.location) AS volunteer_public_location,
          c.id AS commitment_id,
          c.status AS commitment_status,
          c.start_at AS commitment_start_at,
          c.end_at AS commitment_end_at
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        JOIN users v ON v.id = a.volunteer_user_id
        LEFT JOIN user_profiles vp ON vp.user_id = v.id
        LEFT JOIN LATERAL (
          SELECT id, status, start_at, end_at
          FROM request_commitments c
          WHERE c.volunteer_user_id = a.volunteer_user_id AND c.request_id = a.request_id
          ORDER BY c.updated_at DESC
          LIMIT 1
        ) c ON TRUE
        WHERE r.requester_org_slug = $1
          AND ($2::text IS NULL OR a.status = $2)
          AND ($3::uuid IS NULL OR r.id = $3::uuid)
        ORDER BY a.created_at DESC
        `,
        [ok.ctx.org.slug, status, requestId]
      );

      return res.json({ applications: contactsFor(ok.ctx, rows.rows) });
    })
  );

  app.post(
    "/v1/org/applications/:id/attendance/check-in",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid application id" });

      const body = z
        .object({
          notes: z.string().max(5000).optional()
        })
        .safeParse(req.body);

      const notes = body.success && body.data.notes ? String(body.data.notes) : null;

      const appRow = await pool.query(
        `
        SELECT a.id, a.status, a.request_id, a.volunteer_user_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.requester_org_slug = $2
        LIMIT 1
        `,
        [params.data.id, ok.ctx.org.slug]
      );
      if ((appRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

      const status = String(appRow.rows[0]?.status || "");
      if (!["accepted", "confirmed", "completed"].includes(status)) {
        return res.status(409).json({ message: `Cannot check in from status '${status}'` });
      }

      const requestId = String(appRow.rows[0]?.request_id);
      const volunteerUserId = String(appRow.rows[0]?.volunteer_user_id);

      // Forms, guardian consent and checks must be complete and current before anyone checks in (FORM-04).
      const pre = await prerequisites(volunteerUserId, requestId);
      if (pre.status !== "cleared") {
        return res.status(409).json({ error: { code: `prerequisites_${pre.status}`, message: outstanding(pre) }, message: outstanding(pre), prerequisites: pre });
      }

      const open = await pool.query(
        `SELECT id FROM org_attendance_logs WHERE org_slug=$1 AND request_id=$2 AND volunteer_user_id=$3 AND check_out_at IS NULL LIMIT 1`,
        [ok.ctx.org.slug, requestId, volunteerUserId]
      );
      if ((open.rowCount ?? 0) > 0) return res.status(409).json({ message: "Volunteer is already checked in" });

      const inserted = await pool.query(
        `
        INSERT INTO org_attendance_logs (org_slug, request_id, request_application_id, volunteer_user_id, check_in_at, notes, created_by_user_id)
        VALUES ($1, $2, $3, $4, NOW(), $5, $6)
        RETURNING *
        `,
        [ok.ctx.org.slug, requestId, params.data.id, volunteerUserId, notes, String(ok.user.id)]
      );

      return res.status(201).json({ attendance: inserted.rows[0] });
    })
  );

  app.post(
    "/v1/org/applications/:id/attendance/check-out",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid application id" });

      const appRow = await pool.query(
        `
        SELECT a.id, a.request_id, a.volunteer_user_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.requester_org_slug = $2
        LIMIT 1
        `,
        [params.data.id, ok.ctx.org.slug]
      );
      if ((appRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

      const requestId = String(appRow.rows[0]?.request_id);
      const volunteerUserId = String(appRow.rows[0]?.volunteer_user_id);

      const open = await pool.query(
        `
        SELECT id, check_in_at
        FROM org_attendance_logs
        WHERE org_slug=$1 AND request_id=$2 AND volunteer_user_id=$3 AND check_out_at IS NULL
        ORDER BY check_in_at DESC
        LIMIT 1
        `,
        [ok.ctx.org.slug, requestId, volunteerUserId]
      );
      if ((open.rowCount ?? 0) === 0) return res.status(409).json({ message: "No open check-in found" });

      const logId = String(open.rows[0]?.id);

      const updated = await pool.query(
        `
        UPDATE org_attendance_logs
        SET
          check_out_at = NOW(),
          hours = ROUND(EXTRACT(EPOCH FROM (NOW() - check_in_at)) / 3600.0, 2),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [logId]
      );
      const contributionId = await contributionFromAttendance(logId, "staff_check_in", String(ok.user.id));

      return res.json({ attendance: updated.rows[0], contribution_id: contributionId });
    })
  );

  app.patch(
    "/v1/org/applications/:id",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid application id" });

      const schema = z.object({
        status: z.enum(["pending", "accepted", "waitlisted", "rejected", "withdrawn", "confirmed", "completed", "canceled"]).optional(),
        assigned_to_user_id: z.string().uuid().optional().nullable(),
        accepted_amount: z.coerce.number().positive().max(1_000_000).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const p = parsed.data;
      
      let acceptedAmount: number | null = null;
      // Validate status transitions for org-side decisions (waitlist workflow).
      if (p.status) {
        const cur = await pool.query(
          `
          SELECT a.status
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE a.id = $1 AND r.requester_org_slug = $2
          LIMIT 1
          `,
          [params.data.id, ok.ctx.org.slug]
        );
      
        if ((cur.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });
        const fromStatus = String(cur.rows[0]?.status || "");
        const toStatus = String(p.status);
      
        if (fromStatus !== toStatus) {
          const decisionable = fromStatus === "pending" || fromStatus === "waitlisted" || fromStatus === "offered";
          if (!decisionable) {
            return res.status(409).json({ message: `Cannot change status from '${fromStatus}' to '${toStatus}'` });
          }
      
          const allowedFromPending = new Set(["accepted", "rejected", "waitlisted"]);
          const allowedFromWaitlisted = new Set(["pending", "accepted", "rejected"]);
      
          if (fromStatus === "pending" && !allowedFromPending.has(toStatus)) {
            return res.status(409).json({ message: `Cannot change status from '${fromStatus}' to '${toStatus}'` });
          }
          if (fromStatus === "waitlisted" && !allowedFromWaitlisted.has(toStatus)) {
            return res.status(409).json({ message: `Cannot change status from '${fromStatus}' to '${toStatus}'` });
          }
          // Someone holding an offered spot can be accepted (the spot is already theirs) or declined.
          if (fromStatus === "offered" && !["accepted", "rejected"].includes(toStatus)) {
            return res.status(409).json({ message: `Cannot change status from '${fromStatus}' to '${toStatus}'` });
          }
          if (toStatus === "accepted") {
            const check = await checkAccept(params.data.id, p.accepted_amount);
            if (!check.ok) return res.status(check.status).json(acceptError(check));
            acceptedAmount = check.acceptedAmount;
          }
        }
      }
      

      const upd = await pool.query(
        `
        UPDATE request_applications a
        SET
          status = COALESCE($3::text, a.status),
          assigned_to_user_id = COALESCE($4::uuid, a.assigned_to_user_id),
          status_updated_at = CASE WHEN $3::text IS NULL THEN a.status_updated_at ELSE NOW() END,
          status_updated_by_user_id = CASE WHEN $3::text IS NULL THEN a.status_updated_by_user_id ELSE $2::uuid END,
          accepted_amount = COALESCE($6::numeric, a.accepted_amount),
          updated_at = NOW()
        FROM service_requests r
        WHERE a.id = $1
          AND r.id = a.request_id
          AND r.requester_org_slug = $5
        RETURNING a.*
        `,
        [params.data.id, String(ok.user.id), p.status ?? null, p.assigned_to_user_id ?? null, ok.ctx.org.slug, acceptedAmount]
      );

      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });
      if (p.status) await afterApplicationUpdate(params.data.id, p.status, String(ok.user.id));
      return res.json(upd.rows[0]);
    })
  );

}
