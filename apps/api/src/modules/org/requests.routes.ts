import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { needsOwnerApproval, orgStanding, standingMessage } from "../requests/governance";
import { wrap } from "../../lib/http";
import { requireAdminOrManager, requireOrg } from "./context";

export function registerOrgRequestsRoutes(app: Express) {

  // Phase 4.1: Org Requests
    // Phase 4.1: Org Requests
  app.get(
    "/v1/org/requests",
    wrap(async (req, res) => {
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

  app.get(
    "/v1/org/requests/:id",
    wrap(async (req, res) => {
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

  app.get(
    "/v1/org/requests/:id/documents",
    wrap(async (req, res) => {
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

}
