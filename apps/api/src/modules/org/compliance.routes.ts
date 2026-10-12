/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import type { Application, Request } from "express";
import { z } from "zod";
import { contributionFromAttendance } from "../contributions/service";
import { minorSql } from "../../lib/age";
import { outstanding, prerequisites } from "../prerequisites/service";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireAdminOrManager, requireOrg } from "./context";

export function registerOrgComplianceRoutes(app: Express) {

  // Volunteer roster: unique volunteers across requests, with counts + optional filters.
  app.get(
    "/v1/org/roster",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      // Volunteers' contact details and attendance: admins and managers only.
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const q = z
        .object({
          status: z.string().optional(), // active | waitlisted | completed | all
          requestId: z.string().uuid().optional(),
          search: z.string().optional()
        })
        .safeParse(req.query);

      const status = q.success && q.data.status ? String(q.data.status) : "active";
      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const search = q.success && q.data.search ? String(q.data.search) : null;

      const statuses =
        status === "waitlisted"
          ? ["waitlisted"]
          : status === "completed"
            ? ["completed"]
            : status === "all"
              ? ["pending", "accepted", "waitlisted", "rejected", "withdrawn", "confirmed", "completed", "canceled"]
              : ["accepted", "confirmed"]; // default active

      const rows = await pool.query(
        `
        SELECT
          v.id AS volunteer_user_id,
          CASE WHEN COUNT(*) FILTER (WHERE a.status IN ('accepted','confirmed','completed')) > 0 AND NOT ${minorSql("v.id")} THEN v.email END AS volunteer_email,
          vp.display_name AS volunteer_display_name,
          vp.avatar_url AS volunteer_avatar_url,
          COALESCE(vp.public_location, vp.location) AS volunteer_public_location,
          COUNT(*) FILTER (WHERE a.status IN ('accepted','confirmed'))::int AS active_count,
          COUNT(*) FILTER (WHERE a.status = 'waitlisted')::int AS waitlisted_count,
          COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed_count,
          COUNT(*)::int AS total_count,
          MAX(a.updated_at) AS last_activity_at,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.title), NULL) AS request_titles
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        JOIN users v ON v.id = a.volunteer_user_id
        LEFT JOIN user_profiles vp ON vp.user_id = v.id
        WHERE r.requester_org_slug = $1
          AND a.status = ANY($2::text[])
          AND ($3::uuid IS NULL OR r.id = $3::uuid)
          AND (
            $4::text IS NULL
            OR v.email ILIKE '%' || $4 || '%'
            OR COALESCE(vp.display_name,'') ILIKE '%' || $4 || '%'
          )
        GROUP BY v.id, v.email, vp.display_name, vp.avatar_url, vp.public_location, vp.location
        ORDER BY last_activity_at DESC NULLS LAST, volunteer_email ASC
        `,
        [ok.ctx.org.slug, statuses, requestId, search]
      );

      return res.json({
        roster: rows.rows,
        filters: { status, requestId, search }
      });
    })
  );



  // Org Operations: Attendance Tracking (check-in/out + hours)
  app.get(
    "/v1/org/attendance",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      // Volunteers' contact details and attendance: admins and managers only.
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const q = z
        .object({
          requestId: z.string().uuid().optional(),
          volunteerUserId: z.string().uuid().optional(),
          status: z.enum(["open", "closed", "all"]).optional(),
          from: z.string().optional(),
          to: z.string().optional()
        })
        .safeParse(req.query);

      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const volunteerUserId = q.success && q.data.volunteerUserId ? String(q.data.volunteerUserId) : null;
      const status = q.success && q.data.status ? q.data.status : "all";
      const from = q.success && q.data.from ? new Date(String(q.data.from)) : null;
      const to = q.success && q.data.to ? new Date(String(q.data.to)) : null;

      const rows = await pool.query(
        `
        SELECT
          l.id,
          l.org_slug,
          l.request_id,
          r.title AS request_title,
          l.request_application_id,
          l.volunteer_user_id,
          CASE WHEN ${minorSql("u.id")} THEN NULL ELSE u.email END AS volunteer_email,
          up.display_name AS volunteer_display_name,
          l.check_in_at,
          l.check_out_at,
          l.hours,
          l.notes,
          l.created_at,
          l.updated_at
        FROM org_attendance_logs l
        JOIN service_requests r ON r.id = l.request_id
        LEFT JOIN users u ON u.id = l.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = l.volunteer_user_id
        WHERE l.org_slug = $1
          AND ($2::uuid IS NULL OR l.request_id = $2::uuid)
          AND ($3::uuid IS NULL OR l.volunteer_user_id = $3::uuid)
          AND (
            $4::text = 'all'
            OR ($4::text = 'open' AND l.check_out_at IS NULL)
            OR ($4::text = 'closed' AND l.check_out_at IS NOT NULL)
          )
          AND ($5::timestamptz IS NULL OR l.check_in_at >= $5::timestamptz)
          AND ($6::timestamptz IS NULL OR l.check_in_at <= $6::timestamptz)
        ORDER BY l.check_in_at DESC
        LIMIT 500
        `,
        [ok.ctx.org.slug, requestId, volunteerUserId, status, from && !Number.isNaN(from.getTime()) ? from.toISOString() : null, to && !Number.isNaN(to.getTime()) ? to.toISOString() : null]
      );

      return res.json({ attendance: rows.rows });
    })
  );


  app.post(
    "/v1/org/attendance/manual",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const body = z
        .object({
          application_id: z.string().uuid(),
          check_in_at: z.string().min(1),
          check_out_at: z.string().optional(),
          hours: z.number().optional(),
          notes: z.string().max(5000).optional()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      const checkIn = new Date(body.data.check_in_at);
      if (Number.isNaN(checkIn.getTime())) return res.status(400).json({ message: "Invalid check_in_at" });
      const checkOut = body.data.check_out_at ? new Date(body.data.check_out_at) : null;
      if (checkOut && Number.isNaN(checkOut.getTime())) return res.status(400).json({ message: "Invalid check_out_at" });

      const appRow = await pool.query(
        `
        SELECT a.id, a.request_id, a.volunteer_user_id, a.status
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.requester_org_slug = $2
        LIMIT 1
        `,
        [body.data.application_id, ok.ctx.org.slug]
      );
      if ((appRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

      const requestId = String(appRow.rows[0]?.request_id);
      const volunteerUserId = String(appRow.rows[0]?.volunteer_user_id);
      if (!["accepted", "confirmed", "completed"].includes(String(appRow.rows[0]?.status))) {
        return res.status(409).json({ message: "Only accepted volunteers can have attendance recorded" });
      }
      if (checkOut && checkOut < checkIn) return res.status(400).json({ message: "Check-out must be after check-in" });
      // Same rule as live check-in: forms, guardian consent and checks come first (FORM-04).
      const pre = await prerequisites(volunteerUserId, requestId);
      if (pre.status !== "cleared") {
        return res.status(409).json({ error: { code: `prerequisites_${pre.status}`, message: outstanding(pre) }, message: outstanding(pre), prerequisites: pre });
      }

      const derivedHours =
        typeof body.data.hours === "number"
          ? body.data.hours
          : checkOut
            ? Math.round(((checkOut.getTime() - checkIn.getTime()) / 3600000) * 100) / 100
            : null;

      const inserted = await pool.query(
        `
        INSERT INTO org_attendance_logs (org_slug, request_id, request_application_id, volunteer_user_id, check_in_at, check_out_at, hours, notes, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
        [ok.ctx.org.slug, requestId, body.data.application_id, volunteerUserId, checkIn.toISOString(), checkOut ? checkOut.toISOString() : null, derivedHours, body.data.notes ?? null, String((ok.user as any).id)]
      );

      const contributionId = checkOut ? await contributionFromAttendance(String(inserted.rows[0].id), "manual_attendance", String((ok.user as any).id)) : null;
      return res.status(201).json({ attendance: inserted.rows[0], contribution_id: contributionId });
    })
  );


  // Org Operations: Incident Reports
  app.get(
    "/v1/org/incidents",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
          severity: z.enum(["low", "medium", "high", "critical"]).optional(),
          requestId: z.string().uuid().optional(),
          search: z.string().optional()
        })
        .safeParse(req.query);

      const status = q.success && q.data.status ? String(q.data.status) : null;
      const severity = q.success && q.data.severity ? String(q.data.severity) : null;
      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const search = q.success && q.data.search ? String(q.data.search) : null;

      const rows = await pool.query(
        `
        SELECT
          i.*,
          r.title AS request_title,
          CASE WHEN ${minorSql("u.id")} THEN NULL ELSE u.email END AS volunteer_email,
          up.display_name AS volunteer_display_name
        FROM org_incident_reports i
        LEFT JOIN service_requests r ON r.id = i.request_id
        LEFT JOIN users u ON u.id = i.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = i.volunteer_user_id
        WHERE i.org_slug = $1
          AND ($2::text IS NULL OR i.status = $2)
          AND ($3::text IS NULL OR i.severity = $3)
          AND ($4::uuid IS NULL OR i.request_id = $4::uuid)
          AND (
            $5::text IS NULL
            OR i.title ILIKE '%' || $5 || '%'
            OR i.description ILIKE '%' || $5 || '%'
            OR COALESCE(up.display_name,'') ILIKE '%' || $5 || '%'
            OR COALESCE(u.email,'') ILIKE '%' || $5 || '%'
          )
        ORDER BY i.created_at DESC
        LIMIT 500
        `,
        [ok.ctx.org.slug, status, severity, requestId, search]
      );

      return res.json({ incidents: rows.rows });
    })
  );


  app.post(
    "/v1/org/incidents",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const body = z
        .object({
          request_id: z.string().uuid().optional(),
          application_id: z.string().uuid().optional(),
          volunteer_user_id: z.string().uuid().optional(),
          title: z.string().trim().min(2).max(200),
          description: z.string().trim().min(5).max(20000),
          severity: z.enum(["low", "medium", "high", "critical"]).optional()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      let requestId = body.data.request_id ? String(body.data.request_id) : null;
      const applicationId = body.data.application_id ? String(body.data.application_id) : null;
      let volunteerUserId = body.data.volunteer_user_id ? String(body.data.volunteer_user_id) : null;

      if (applicationId) {
        const a = await pool.query(
          `
          SELECT a.request_id, a.volunteer_user_id
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE a.id = $1 AND r.requester_org_slug = $2
          LIMIT 1
          `,
          [applicationId, ok.ctx.org.slug]
        );
        if ((a.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });
        requestId = String(a.rows[0]?.request_id);
        volunteerUserId = String(a.rows[0]?.volunteer_user_id);
      } else if (requestId) {
        const r = await pool.query("SELECT 1 FROM service_requests WHERE id=$1 AND requester_org_slug=$2", [requestId, ok.ctx.org.slug]);
        if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: "Request not found" });
      } else {
        return res.status(400).json({ message: "request_id or application_id is required" });
      }

      const inserted = await pool.query(
        `
        INSERT INTO org_incident_reports (org_slug, request_id, request_application_id, volunteer_user_id, title, description, severity, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          ok.ctx.org.slug,
          requestId,
          applicationId,
          volunteerUserId,
          body.data.title,
          body.data.description,
          body.data.severity ?? "medium",
          String((ok.user as any).id)
        ]
      );

      return res.status(201).json({ incident: inserted.rows[0] });
    })
  );


  app.get(
    "/v1/org/incidents/:id",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid incident id" });

      const row = await pool.query(
        `
        SELECT
          i.*,
          r.title AS request_title,
          CASE WHEN ${minorSql("u.id")} THEN NULL ELSE u.email END AS volunteer_email,
          up.display_name AS volunteer_display_name
        FROM org_incident_reports i
        LEFT JOIN service_requests r ON r.id = i.request_id
        LEFT JOIN users u ON u.id = i.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = i.volunteer_user_id
        WHERE i.org_slug = $1 AND i.id = $2
        LIMIT 1
        `,
        [ok.ctx.org.slug, params.data.id]
      );

      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Incident not found" });

      return res.json({ incident: row.rows[0] });
    })
  );


  app.patch(
    "/v1/org/incidents/:id",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid incident id" });

      const body = z
        .object({
          title: z.string().trim().min(2).max(200).optional(),
          description: z.string().trim().min(5).max(20000).optional(),
          severity: z.enum(["low", "medium", "high", "critical"]).optional(),
          status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
          internal_notes: z.string().max(20000).optional().nullable(),
          outcome: z.string().max(20000).optional().nullable()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      const upd = await pool.query(
        `
        UPDATE org_incident_reports
        SET
          title = COALESCE($3, title),
          description = COALESCE($4, description),
          severity = COALESCE($5, severity),
          status = COALESCE($6, status),
          internal_notes = CASE WHEN $7::text IS NULL THEN internal_notes ELSE $7::text END,
          outcome = CASE WHEN $8::text IS NULL THEN outcome ELSE $8::text END,
          updated_at = NOW()
        WHERE org_slug = $1 AND id = $2
        RETURNING *
        `,
        [
          ok.ctx.org.slug,
          params.data.id,
          body.data.title ?? null,
          body.data.description ?? null,
          body.data.severity ?? null,
          body.data.status ?? null,
          body.data.internal_notes ?? null,
          body.data.outcome ?? null
        ]
      );

      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Incident not found" });

      return res.json({ incident: upd.rows[0] });
    })
  );
}
