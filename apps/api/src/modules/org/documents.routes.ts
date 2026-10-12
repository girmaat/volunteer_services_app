import { documentType } from "../messaging/files";
import type { Express } from "express";
import { contentDisposition } from "../../lib/http";
import { z } from "zod";
import { minorSql } from "../../lib/age";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { contactsFor, orgDocUploadMiddleware, requireAdminOrManager, requireOrg } from "./context";
import crypto from "node:crypto";
import { notify } from "../notifications/service";

const sha256Hex = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

export function registerOrgDocumentsRoutes(app: Express) {

  // Org Operations: Waivers & Training Docs
  app.get(
    "/v1/org/documents",
    wrap(async (req, res) => {
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
          d.current_version,
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
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const file = req.file;
      if (!file) return res.status(400).json({ message: "Missing file" });

      const real = documentType(file.buffer, file.originalname);
      if (!real) return res.status(400).json({ message: "Unsupported file type. Use PDF, JPG, or PNG." });
      file.mimetype = real;

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
          String(ok.user.id)
        ]
      );

      await pool.query(
        `INSERT INTO org_document_versions (document_id, version, title, file_name, mime_type, bytes, sha256, created_by_user_id)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
        [inserted.rows[0].id, body.data.title, file.originalname, file.mimetype, file.buffer, sha256Hex(file.buffer), String(ok.user.id)]
      );

      return res.status(201).json({ document: { ...inserted.rows[0], current_version: 1 } });
    })
  );

  // A new version of a form. When it changes what people agree to, earlier signatures stop counting
  // and anyone already assigned has to sign again before check-in (FORM-02, FORM-04).
  app.post(
    "/v1/org/documents/:id/versions",
    orgDocUploadMiddleware,
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;
      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Missing file" });
      const real = documentType(file.buffer, file.originalname);
      if (!real) return res.status(400).json({ message: "Unsupported file type. Use PDF, JPG, or PNG." });
      file.mimetype = real;
      const body = z
        .object({ change_note: z.string().trim().min(3).max(1000), requires_resign: z.string().optional(), title: z.string().trim().min(2).max(200).optional() })
        .safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ message: "Say what changed in this version" });
      const doc = (await pool.query("SELECT id, title, current_version FROM org_documents WHERE id = $1 AND org_slug = $2", [params.data.id, ok.ctx.org.slug])).rows[0];
      if (!doc) return res.status(404).json({ message: "Document not found" });
      const version = Number(doc.current_version) + 1;
      const resign = String(body.data.requires_resign ?? "true").toLowerCase() !== "false";
      const title = body.data.title || String(doc.title);
      await pool.query(
        `INSERT INTO org_document_versions (document_id, version, title, file_name, mime_type, bytes, sha256, requires_resign, change_note, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [doc.id, version, title, file.originalname, file.mimetype, file.buffer, sha256Hex(file.buffer), resign, body.data.change_note, String(ok.user.id)]
      );
      await pool.query(
        "UPDATE org_documents SET current_version = $2, title = $3, file_name = $4, mime_type = $5, bytes = $6, updated_at = NOW() WHERE id = $1",
        [doc.id, version, title, file.originalname, file.mimetype, file.buffer]
      );
      let affected = 0;
      if (resign) {
        // Everyone currently assigned who signed an older version: tell them, and the organizers.
        const who = await pool.query(
          `SELECT DISTINCT k.volunteer_user_id, k.request_id, r.title, a.id AS application_id
             FROM volunteer_document_acks k
             JOIN request_applications a ON a.request_id = k.request_id AND a.volunteer_user_id = k.volunteer_user_id AND a.status IN ('accepted', 'confirmed')
             JOIN service_requests r ON r.id = k.request_id
            WHERE k.org_document_id = $1
              AND NOT EXISTS (SELECT 1 FROM volunteer_document_acks k2 WHERE k2.org_document_id = k.org_document_id AND k2.volunteer_user_id = k.volunteer_user_id AND k2.request_id = k.request_id AND k2.document_version >= $2)`,
          [doc.id, version]
        );
        affected = who.rowCount ?? 0;
        for (const w of who.rows) {
          await notify(String(w.volunteer_user_id), "prerequisites", {
            title: `Sign the updated “${title}” before your shift`,
            body: body.data.change_note,
            href: `/volunteer/applications/${w.application_id}`,
            email: {
              subject: `Updated form: ${title}`,
              heading: "A form you signed was updated",
              lines: [`${ok.ctx.org.name} updated “${title}” for “${w.title}”.`, `What changed: ${body.data.change_note}`, "You'll need to sign the new version before you can check in."],
              cta: { label: "Review and sign", url: `/volunteer/applications/${w.application_id}` }
            }
          });
        }
        if (affected) {
          const staff = await pool.query("SELECT user_id FROM organization_members WHERE org_slug = $1 AND status = 'active' AND role IN ('admin', 'manager') AND user_id IS NOT NULL", [ok.ctx.org.slug]);
          for (const m of staff.rows) {
            await notify(String(m.user_id), "prerequisites", {
              title: `${affected} volunteer${affected === 1 ? "" : "s"} must re-sign “${title}”`,
              body: "Check-in stays blocked for them until they sign the new version.",
              href: "/org/documents"
            });
          }
        }
      }
      return res.status(201).json({ document_id: doc.id, version, requires_resign: resign, volunteers_to_resign: affected });
    })
  );

  app.get(
    "/v1/org/documents/:id/versions",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });
      const r = await pool.query(
        `SELECT v.version, v.title, v.file_name, v.sha256, v.requires_resign, v.change_note, v.created_at, p.display_name AS created_by
           FROM org_document_versions v JOIN org_documents d ON d.id = v.document_id LEFT JOIN user_profiles p ON p.user_id = v.created_by_user_id
          WHERE v.document_id = $1 AND d.org_slug = $2 ORDER BY v.version DESC`,
        [params.data.id, ok.ctx.org.slug]
      );
      return res.json({ versions: r.rows });
    })
  );

  app.get(
    "/v1/org/documents/:id/download",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });

      const row = await pool.query(
        `SELECT file_name, mime_type, bytes FROM org_documents WHERE org_slug=$1 AND id=$2 LIMIT 1`,
        [ok.ctx.org.slug, params.data.id]
      );
      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not found" });

      const r = row.rows[0];
      res.setHeader("content-type", r.mime_type || "application/octet-stream");
      res.setHeader("content-disposition", contentDisposition(r.file_name));
      return res.status(200).send(r.bytes);
    })
  );

  app.post(
    "/v1/org/documents/:id/assign",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid document id" });

      const body = z
        .object({
          request_id: z.string().uuid().optional().nullable(),
          required_before: z.enum(["apply", "check_in"]).default("check_in")
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
        INSERT INTO org_document_assignments (org_document_id, request_id, created_by_user_id, required_before)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (org_document_id, request_id) DO UPDATE SET required_before = EXCLUDED.required_before
        `,
        [params.data.id, requestId, String(ok.user.id), body.data.required_before]
      );

      return res.json({ ok: true });
    })
  );

  app.delete(
    "/v1/org/documents/:id/assign",
    wrap(async (req, res) => {
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
    wrap(async (req, res) => {
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
          CASE WHEN ${minorSql("u.id")} THEN NULL ELSE u.email END AS volunteer_email,
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

      return res.json({ acknowledgements: contactsFor(ok.ctx, rows.rows) });
    })
  );
}
