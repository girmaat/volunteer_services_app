/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { applyLegacyStatus, createAndPublishLegacy } from "../requests/legacy";
import { transitionRequest, TransitionError } from "../requests/lifecycle";
import { wrap } from "../../lib/http";
import { requireAdminOrManager, requireOrg } from "./context";

export function registerOrgRequestsRoutes(app: Express) {

  // Phase 4.1: Org Requests
    // Phase 4.1: Org Requests
  app.get(
    "/v1/org/requests",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          status: z.string().optional(),
          q: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
          offset: z.coerce.number().int().min(0).optional()
        })
        .safeParse(req.query);

      const status = q.success && q.data.status ? String(q.data.status) : null;
      const search = q.success && q.data.q ? String(q.data.q).trim() : null;
      const limit = q.success && q.data.limit ? Number(q.data.limit) : 200;
      const offset = q.success && q.data.offset ? Number(q.data.offset) : 0;

      const count = await pool.query(
        `
        SELECT COUNT(*)::int AS c
        FROM service_requests r
        WHERE r.requester_org_slug=$1
          AND ($2::text IS NULL OR r.status=$2)
          AND ($3::text IS NULL OR (r.title ILIKE '%'||$3||'%' OR r.description ILIKE '%'||$3||'%'))
        `,
        [ok.ctx.org.slug, status, search]
      );

      const rows = await pool.query(
        `
        WITH apps AS (
          SELECT
            a.request_id,
            COUNT(*)::int AS applications_total,
            COUNT(*) FILTER (WHERE a.status = 'pending')::int AS applications_pending,
            COUNT(*) FILTER (WHERE a.status IN ('accepted','confirmed'))::int AS applications_active,
            COUNT(*) FILTER (WHERE a.status = 'confirmed')::int AS applications_confirmed
          FROM request_applications a
          GROUP BY a.request_id
        )
        SELECT
          r.id,
          r.title,
          r.description,
          r.status,
          r.location_text,
          r.mode,
          r.needed_by,
          r.tags,
          r.created_at,
          r.updated_at,
          COALESCE(apps.applications_total, 0)::int AS applications_total,
          COALESCE(apps.applications_pending, 0)::int AS applications_pending,
          COALESCE(apps.applications_active, 0)::int AS applications_active,
          COALESCE(apps.applications_confirmed, 0)::int AS applications_confirmed
        FROM service_requests r
        LEFT JOIN apps ON apps.request_id = r.id
        WHERE r.requester_org_slug=$1
          AND ($2::text IS NULL OR r.status=$2)
          AND ($3::text IS NULL OR (r.title ILIKE '%'||$3||'%' OR r.description ILIKE '%'||$3||'%'))
        ORDER BY r.updated_at DESC
        LIMIT $4 OFFSET $5
        `,
        [ok.ctx.org.slug, status, search, limit, offset]
      );

      return res.json({
        requests: rows.rows,
        total: Number(count.rows[0]?.c ?? 0),
        limit,
        offset
      });
    })
  );



  app.post(
    "/v1/org/requests",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const schema = z.object({
        title: z.string().min(2),
        description: z.string().min(10),
        status: z.enum(["open", "paused", "closed"]).optional(),
        location_text: z.string().optional().nullable(),
        mode: z.preprocess((v) => (typeof v === "string" ? v.replace("_", "-") : v), z.enum(["in-person", "remote", "hybrid"]).optional().nullable()),
        needed_by: z.string().datetime().optional().nullable(),
        tags: z.array(z.string()).optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const p = parsed.data;
      const id = await createAndPublishLegacy({
        userId: String((ok.user as any).id),
        orgSlug: ok.ctx.org.slug,
        title: p.title,
        description: p.description,
        mode: (p.mode ?? "remote") as "in-person" | "remote" | "hybrid",
        area: p.location_text ?? "",
        neededBy: p.needed_by ?? null,
        tags: (p.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
        status: p.status ?? "open"
      });
      const insert = await pool.query("SELECT * FROM service_requests WHERE id = $1", [id]);
      return res.status(201).json({ request: insert.rows[0] });
    })
  );


  app.get(
    "/v1/org/requests/:id",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid request id" });

      const rows = await pool.query(
        `
        WITH apps AS (
          SELECT
            a.request_id,
            COUNT(*)::int AS applications_total,
            COUNT(*) FILTER (WHERE a.status = 'pending')::int AS applications_pending,
            COUNT(*) FILTER (WHERE a.status IN ('accepted','confirmed'))::int AS applications_active,
            COUNT(*) FILTER (WHERE a.status = 'confirmed')::int AS applications_confirmed
          FROM request_applications a
          WHERE a.request_id = $2::uuid
          GROUP BY a.request_id
        )
        SELECT
          r.id,
          r.title,
          r.description,
          r.status,
          r.location_text,
          r.mode,
          r.needed_by,
          r.tags,
          r.created_at,
          r.updated_at,
          COALESCE(apps.applications_total, 0)::int AS applications_total,
          COALESCE(apps.applications_pending, 0)::int AS applications_pending,
          COALESCE(apps.applications_active, 0)::int AS applications_active,
          COALESCE(apps.applications_confirmed, 0)::int AS applications_confirmed
        FROM service_requests r
        LEFT JOIN apps ON apps.request_id = r.id
        WHERE r.id=$2::uuid AND r.requester_org_slug=$1
        `,
        [ok.ctx.org.slug, params.data.id]
      );
      if ((rows.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });

      return res.json(rows.rows[0]);
    })
  );



  app.patch(
    "/v1/org/requests/:id",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid request id" });

      const schema = z.object({
        title: z.string().min(2).optional(),
        description: z.string().min(10).optional(),
        status: z.enum(["open", "paused", "closed"]).optional(),
        location_text: z.string().optional().nullable(),
        mode: z.enum(["in-person", "remote", "hybrid"]).optional().nullable(),
        needed_by: z.string().datetime().optional().nullable(),
        tags: z.array(z.string()).optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const p = parsed.data;

      const update = await pool.query(
        `
        UPDATE service_requests
        SET
          title = COALESCE($3, title),
          description = COALESCE($4, description),
          location_text = COALESCE($6, location_text),
          public_area = COALESCE(NULLIF($6, ''), public_area),
          mode = COALESCE($7, mode),
          needed_by = COALESCE($8::timestamptz, needed_by),
          tags = COALESCE($9, tags),
          required_skills = COALESCE($9, required_skills),
          updated_at = NOW()
        WHERE requester_org_slug=$1 AND id=$2 AND ($5::text IS NULL OR TRUE)
        RETURNING *
        `,
        [
          ok.ctx.org.slug,
          params.data.id,
          p.title ?? null,
          p.description ?? null,
          p.status ?? null,
          p.location_text ?? null,
          p.mode ?? null,
          p.needed_by ?? null,
          p.tags ?? null
        ]
      );

      if ((update.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });
      const moved = await applyLegacyStatus(params.data.id, String(update.rows[0].status), p.status, String((ok.user as any).id));
      if (moved) update.rows[0].status = moved;
      return res.json(update.rows[0]);
    })
  );


  app.post(
    "/v1/org/requests/:id/cancel",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid request id" });

      const upd = await pool.query("SELECT id, status FROM service_requests WHERE requester_org_slug=$1 AND id=$2", [ok.ctx.org.slug, params.data.id]);
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });
      const reason = typeof req.body?.reason === "string" && req.body.reason.trim() ? String(req.body.reason).slice(0, 500) : "Canceled by the organization";
      try {
        await transitionRequest(params.data.id, "cancel", { userId: String((ok.user as any).id), kind: "user" }, { reason });
      } catch (e) {
        if (e instanceof TransitionError) return res.status(e.status).json({ message: e.message });
        throw e;
      }
      return res.json({ ok: true });
    })
  );


  app.get(
    "/v1/org/requests/:id/attendance",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid request id" });

      const rows = await pool.query(
        `
        SELECT
          l.id,
          l.request_id,
          r.title AS request_title,
          l.request_application_id,
          l.volunteer_user_id,
          u.email AS volunteer_email,
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
        WHERE l.org_slug = $1 AND l.request_id = $2
        ORDER BY l.check_in_at DESC
        LIMIT 500
        `,
        [ok.ctx.org.slug, params.data.id]
      );

      return res.json({ attendance: rows.rows });
    })
  );


  app.get(
    "/v1/org/requests/:id/documents",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid request id" });

      const docs = await pool.query(
        `
        SELECT
          d.id,
          d.doc_type,
          d.title,
          d.description,
          d.file_name,
          d.mime_type,
          d.require_ack,
          d.active,
          a.request_id,
          COUNT(ack.id)::int AS ack_count
        FROM org_document_assignments a
        JOIN org_documents d ON d.id = a.org_document_id
        LEFT JOIN volunteer_document_acks ack ON ack.org_document_id = d.id AND ack.request_id = $2
        WHERE d.org_slug = $1
          AND (a.request_id = $2 OR a.request_id IS NULL)
          AND d.active = TRUE
        GROUP BY d.id, a.request_id
        ORDER BY d.created_at DESC
        `,
        [ok.ctx.org.slug, params.data.id]
      );

      return res.json({ documents: docs.rows });
    })
  );


  app.get(
    "/v1/org/requests/:id/applications",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid request id" });

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
          v.id AS volunteer_user_id,
          v.email AS volunteer_email,
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
        WHERE r.requester_org_slug = $1 AND r.id = $2
        ORDER BY a.created_at DESC
        `,
        [ok.ctx.org.slug, params.data.id]
      );

      return res.json({ applications: rows.rows });
    })
  );
}
