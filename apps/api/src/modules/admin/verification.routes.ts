/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { contentDisposition } from "../../lib/http";
import { z } from "zod";
import { requirePlatformAdmin } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { parseLimit } from "./helpers";

export function registerAdminVerificationRoutes(app: Express) {

  // User verification review
  app.get(
    "/v1/admin/user-verification/queue",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const limit = parseLimit(req.query.limit, 50, 200);

      const rows = await pool.query(
        `SELECT
           u.id,
           u.email,
           u.verification_required,
           u.verification_status,
           u.verification_submitted_at,
           u.verified_at,
           u.verification_notes,
           p.display_name,
           (SELECT COUNT(*)::int FROM verification_documents d WHERE d.user_id = u.id) AS docs_count,
           (SELECT MAX(uploaded_at) FROM verification_documents d WHERE d.user_id = u.id) AS last_uploaded_at,
           u.updated_at
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.verification_required = TRUE
            OR u.verification_status IN ('required','submitted','rejected')
         ORDER BY COALESCE(u.verification_submitted_at, u.updated_at) DESC
         LIMIT $1`,
        [limit]
      );

      return res.json({ users: rows.rows });
    })
  );


  app.get(
    "/v1/admin/user-verification/:userId/documents",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const userId = String(req.params.userId || "");
      const rows = await pool.query(
        `SELECT id, file_name, mime_type, uploaded_at
           FROM verification_documents
          WHERE user_id = $1
          ORDER BY uploaded_at DESC`,
        [userId]
      );

      return res.json({ documents: rows.rows });
    })
  );


  app.get(
    "/v1/admin/user-verification/documents/:docId/download",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const docId = String(req.params.docId || "");
      const rows = await pool.query(`SELECT id, file_name, mime_type, bytes FROM verification_documents WHERE id = $1`, [docId]);
      if ((rows.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not found" });

      const d = rows.rows[0] as any;
      res.setHeader("content-type", d.mime_type || "application/octet-stream");
      res.setHeader("content-disposition", contentDisposition(d.file_name));
      return res.send(d.bytes);
    })
  );


  app.post(
    "/v1/admin/user-verification/:userId/approve",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const userId = String(req.params.userId || "");
      const schema = z.object({ notes: z.string().max(4000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const upd = await pool.query(
        `UPDATE users
            SET verification_required = FALSE,
                verification_status = 'approved',
                verified_at = NOW(),
                verified_by_user_id = $2,
                verification_notes = $3,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id`,
        [userId, String((r.user as any).id), parsed.data.notes ? String(parsed.data.notes) : null]
      );
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "User not found" });
      return res.json({ ok: true });
    })
  );


  app.post(
    "/v1/admin/user-verification/:userId/reject",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const userId = String(req.params.userId || "");
      const schema = z.object({ notes: z.string().max(4000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const upd = await pool.query(
        `UPDATE users
            SET verification_required = TRUE,
                verification_status = 'rejected',
                verification_notes = $2,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id`,
        [userId, parsed.data.notes ? String(parsed.data.notes) : null]
      );
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "User not found" });
      return res.json({ ok: true });
    })
  );
}
