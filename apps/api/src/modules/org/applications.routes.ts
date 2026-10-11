/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import type { Application } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { afterApplicationUpdate, applicationHasSlot, FULL_MESSAGE } from "../requests/applications";
import { wrap } from "../../lib/http";
import { requireAdminOrManager, requireOrg } from "./context";

export function registerOrgApplicationsRoutes(app: Express) {

  // Phase 4.2: Org Applications pipeline
  app.get(
    "/v1/org/applications",
    wrap(async (req: any, res: any) => {
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
          a.message,
          a.created_at,
          a.updated_at,
          a.assigned_to_user_id,
          r.id AS request_id,
          r.title AS request_title,
          v.id AS volunteer_user_id,
          CASE WHEN a.status IN ('accepted','confirmed','completed') THEN v.email END AS volunteer_email,
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


      return res.json({ applications: rows.rows });
    })
  );


  app.post(
    "/v1/org/applications/:id/attendance/check-in",
    wrap(async (req: any, res: any) => {
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
        [ok.ctx.org.slug, requestId, params.data.id, volunteerUserId, notes, String((ok.user as any).id)]
      );

      return res.status(201).json({ attendance: inserted.rows[0] });
    })
  );


  app.post(
    "/v1/org/applications/:id/attendance/check-out",
    wrap(async (req: any, res: any) => {
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

      return res.json({ attendance: updated.rows[0] });
    })
  );


  app.patch(
    "/v1/org/applications/:id",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid application id" });

      const schema = z.object({
        status: z.enum(["pending", "accepted", "waitlisted", "rejected", "withdrawn", "confirmed", "completed", "canceled"]).optional(),
        assigned_to_user_id: z.string().uuid().optional().nullable()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const p = parsed.data;
      
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
          const decisionable = fromStatus === "pending" || fromStatus === "waitlisted";
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
          if (toStatus === "accepted" && !(await applicationHasSlot(params.data.id))) {
            return res.status(409).json({ error: { code: "full", message: FULL_MESSAGE }, message: FULL_MESSAGE });
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
          updated_at = NOW()
        FROM service_requests r
        WHERE a.id = $1
          AND r.id = a.request_id
          AND r.requester_org_slug = $5
        RETURNING a.*
        `,
        [params.data.id, String((ok.user as any).id), p.status ?? null, p.assigned_to_user_id ?? null, ok.ctx.org.slug]
      );

      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });
      if (p.status) await afterApplicationUpdate(params.data.id, p.status, String((ok.user as any).id));
      return res.json(upd.rows[0]);
    })
  );


  app.post(
    "/v1/org/applications/:id/confirm",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid application id" });

      const body = z
        .object({
          start_at: z.string().min(1),
          end_at: z.string().optional()
        })
        .parse(req.body);

      const appRes = await pool.query(
        `
        SELECT a.id, a.status, a.volunteer_user_id, a.request_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.requester_org_slug = $2
        `,
        [params.data.id, ok.ctx.org.slug]
      );

      if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

      const status = String(appRes.rows[0]?.status || "");
      if (status !== "accepted" && status !== "confirmed") {
        return res.status(409).json({ message: `Cannot confirm/schedule from status '${status}'` });
      }

      const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
      const requestId = String(appRes.rows[0]?.request_id);

      const startAt = new Date(body.start_at);
      if (Number.isNaN(startAt.getTime())) return res.status(400).json({ message: "Invalid start_at" });
      const endAt = body.end_at ? new Date(body.end_at) : null;
      if (endAt && Number.isNaN(endAt.getTime())) return res.status(400).json({ message: "Invalid end_at" });

      const existingCommitment = await pool.query(
        "SELECT id FROM request_commitments WHERE volunteer_user_id = $1 AND request_id = $2 ORDER BY updated_at DESC LIMIT 1",
        [volunteerUserId, requestId]
      );

      let commitmentId: string | null = null;

      if ((existingCommitment.rowCount ?? 0) > 0) {
        commitmentId = String(existingCommitment.rows[0]?.id);
        await pool.query(
          "UPDATE request_commitments SET status = 'confirmed', start_at = $3, end_at = $4, updated_at = NOW() WHERE id = $1 AND volunteer_user_id = $2",
          [commitmentId, volunteerUserId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
        );
      } else {
        const inserted = await pool.query(
          "INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, end_at) VALUES ($1, $2, 'confirmed', $3, $4) RETURNING id",
          [volunteerUserId, requestId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
        );
        commitmentId = inserted.rows[0]?.id ?? null;
      }

      await pool.query(
        `
        UPDATE request_applications a
        SET
          status = 'confirmed',
          status_updated_at = NOW(),
          status_updated_by_user_id = $2::uuid,
          updated_at = NOW()
        FROM service_requests r
        WHERE a.id = $1 AND r.id = a.request_id AND r.requester_org_slug = $3
        `,
        [params.data.id, String((ok.user as any).id), ok.ctx.org.slug]
      );

      await afterApplicationUpdate(params.data.id, "confirmed", String((ok.user as any).id));
      return res.json({ ok: true, status: "confirmed", commitment_id: commitmentId });
    })
  );


  app.post(
    "/v1/org/applications/:id/cancel",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid application id" });

      const appRes = await pool.query(
        `
        SELECT a.id, a.status, a.volunteer_user_id, a.request_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.requester_org_slug = $2
        `,
        [params.data.id, ok.ctx.org.slug]
      );

      if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

      const status = String(appRes.rows[0]?.status || "");
      if (status === "canceled") return res.json({ ok: true, status: "canceled" });

      if (status !== "accepted" && status !== "confirmed") {
        return res.status(409).json({ message: `Cannot cancel from status '${status}'` });
      }

      const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
      const requestId = String(appRes.rows[0]?.request_id);

      await pool.query(
        `
        UPDATE request_applications a
        SET
          status = 'canceled',
          status_updated_at = NOW(),
          status_updated_by_user_id = $2::uuid,
          updated_at = NOW()
        FROM service_requests r
        WHERE a.id = $1 AND r.id = a.request_id AND r.requester_org_slug = $3
        `,
        [params.data.id, String((ok.user as any).id), ok.ctx.org.slug]
      );

      await pool.query(
        "UPDATE request_commitments SET status = 'canceled', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2",
        [volunteerUserId, requestId]
      );

      await afterApplicationUpdate(params.data.id, "canceled", String((ok.user as any).id));
      return res.json({ ok: true, status: "canceled" });
    })
  );


  app.post(
    "/v1/org/applications/:id/complete",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid application id" });

      const appRes = await pool.query(
        `
        SELECT a.id, a.status, a.volunteer_user_id, a.request_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.requester_org_slug = $2
        `,
        [params.data.id, ok.ctx.org.slug]
      );

      if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

      const status = String(appRes.rows[0]?.status || "");
      if (status !== "confirmed") {
        return res.status(409).json({ message: `Cannot complete from status '${status}'` });
      }

      const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
      const requestId = String(appRes.rows[0]?.request_id);

      await pool.query(
        `
        UPDATE request_applications a
        SET
          status = 'completed',
          status_updated_at = NOW(),
          status_updated_by_user_id = $2::uuid,
          updated_at = NOW()
        FROM service_requests r
        WHERE a.id = $1 AND r.id = a.request_id AND r.requester_org_slug = $3
        `,
        [params.data.id, String((ok.user as any).id), ok.ctx.org.slug]
      );

      await pool.query(
        "UPDATE request_commitments SET status = 'completed', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2",
        [volunteerUserId, requestId]
      );

      await afterApplicationUpdate(params.data.id, "completed", String((ok.user as any).id));
      return res.json({ ok: true, status: "completed" });
    })
  );
}
