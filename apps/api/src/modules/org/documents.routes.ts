/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { contentDisposition } from "../../lib/http";
import type { Request } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { orgDocUploadMiddleware, requireAdminOrManager, requireOrg } from "./context";

export function registerOrgDocumentsRoutes(app: Express) {

  // Org Operations: Waivers & Training Docs
  app.get(
    "/v1/org/documents",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const rows = await pool.query(
        `
        SELECT
          d.id,
          d.org_slug,
          d.doc_type,
          d.title,
          d.description,
          d.file_name,
          d.mime_type,
          d.require_ack,
          d.active,
          d.created_at,
          d.updated_at,
          COUNT(DISTINCT a.id) FILTER (WHERE a.id IS NOT NULL)::int AS assignment_count
        FROM org_documents d
        LEFT JOIN org_document_assignments a ON a.org_document_id = d.id
        WHERE d.org_slug = $1
        GROUP BY d.id
        ORDER BY d.created_at DESC
        `,
        [ok.ctx.org.slug]
      );

      return res.json({ documents: rows.rows });
    })
  );


  app.post(
    "/v1/org/documents",
    orgDocUploadMiddleware,
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ message: "Missing file" });

      const allowed = ["application/pdf", "image/jpeg", "image/png"];
      if (!allowed.includes(file.mimetype)) {
        return res.status(400).json({ message: "Unsupported file type. Use PDF, JPG, or PNG." });
      }

      const body = z
        .object({
          doc_type: z.enum(["waiver", "training"]),
          title: z.string().trim().min(2).max(200),
          description: z.string().trim().max(5000).optional(),
          require_ack: z.string().optional(),
          active: z.string().optional()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      const requireAck = String(body.data.require_ack || "true").toLowerCase() !== "false";
      const active = String(body.data.active || "true").toLowerCase() !== "false";

      const inserted = await pool.query(
        `
        INSERT INTO org_documents (org_slug, doc_type, title, description, file_name, mime_type, bytes, require_ack, active, created_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, org_slug, doc_type, title, description, file_name, mime_type, require_ack, active, created_at, updated_at
        `,
        [
          ok.ctx.org.slug,
          body.data.doc_type,
          body.data.title,
          body.data.description ?? null,
          file.originalname,
          file.mimetype,
          file.buffer,
          requireAck,
          active,
          String((ok.user as any).id)
        ]
      );

      return res.status(201).json({ document: inserted.rows[0] });
    })
  );


  app.get(
    "/v1/org/documents/:id/download",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });

      const row = await pool.query(
        `SELECT file_name, mime_type, bytes FROM org_documents WHERE org_slug=$1 AND id=$2 LIMIT 1`,
        [ok.ctx.org.slug, params.data.id]
      );
      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not found" });

      const r = row.rows[0] as any;
      res.setHeader("content-type", r.mime_type || "application/octet-stream");
      res.setHeader("content-disposition", contentDisposition(r.file_name));
      return res.status(200).send(r.bytes);
    })
  );


  app.post(
    "/v1/org/documents/:id/assign",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });

      const body = z
        .object({
          request_id: z.string().uuid().optional().nullable()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      const doc = await pool.query(`SELECT 1 FROM org_documents WHERE org_slug=$1 AND id=$2`, [ok.ctx.org.slug, params.data.id]);
      if ((doc.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not found" });

      const requestId = body.data.request_id ? String(body.data.request_id) : null;
      if (requestId) {
        const r = await pool.query(`SELECT 1 FROM service_requests WHERE id=$1 AND requester_org_slug=$2`, [requestId, ok.ctx.org.slug]);
        if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: "Request not found" });
      } else {
        // Ensure at most one org-wide assignment per document (NULL isn't unique in SQL)
        await pool.query(`DELETE FROM org_document_assignments WHERE org_document_id=$1 AND request_id IS NULL`, [params.data.id]);
      }

      await pool.query(
        `
        INSERT INTO org_document_assignments (org_document_id, request_id, created_by_user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (org_document_id, request_id) DO NOTHING
        `,
        [params.data.id, requestId, String((ok.user as any).id)]
      );

      return res.json({ ok: true });
    })
  );


  app.delete(
    "/v1/org/documents/:id/assign",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });

      const q = z.object({ requestId: z.string().uuid().optional() }).safeParse(req.query);
      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;

      const del = await pool.query(
        `DELETE FROM org_document_assignments WHERE org_document_id=$1 AND ( ($2::uuid IS NULL AND request_id IS NULL) OR request_id=$2::uuid )`,
        [params.data.id, requestId]
      );

      return res.json({ ok: true, deleted: del.rowCount ?? 0 });
    })
  );


  app.get(
    "/v1/org/documents/:id/acks",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });

      const q = z.object({ requestId: z.string().uuid() }).safeParse(req.query);
      if (!q.success) return res.status(400).json({ message: "requestId is required" });
      const requestId = String(q.data.requestId);

      const rows = await pool.query(
        `
        SELECT
          ack.*,
          u.email AS volunteer_email,
          up.display_name AS volunteer_display_name
        FROM volunteer_document_acks ack
        JOIN org_documents d ON d.id = ack.org_document_id
        LEFT JOIN users u ON u.id = ack.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = ack.volunteer_user_id
        WHERE d.org_slug = $1 AND ack.org_document_id = $2 AND ack.request_id = $3
        ORDER BY ack.acknowledged_at DESC
        `,
        [ok.ctx.org.slug, params.data.id, requestId]
      );

      return res.json({ acknowledgements: rows.rows });
    })
  );
}
