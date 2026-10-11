/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requirePlatformAdmin as requirePlatformAdminAccess } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";

export function registerAdminOrgVerificationRoutes(app: Express) {

// Platform-admin org verification queue + decisions
app.get(
  "/v1/admin/org-verification/queue",
  wrap(async (req, res) => {
    const r = await requirePlatformAdminAccess(pool, req, res);
    if (!r) return;
    const { user } = r;

    const rows = await pool.query(
      `
      SELECT
        slug,
        name,
        contact_email,
        verification_required,
        verification_status,
        verification_submitted_at,
        verification_submission_notes,
        verification_notes,
        verified_at,
        updated_at
      FROM organizations
      WHERE verification_required = TRUE
         OR verification_status IN ('required','submitted','rejected')
      ORDER BY COALESCE(verification_submitted_at, updated_at) DESC
      LIMIT 200
      `
    );

    return res.json({ orgs: rows.rows });
  })
);


app.post(
  "/v1/admin/org-verification/:slug/approve",
  wrap(async (req: any, res: any) => {
    const r = await requirePlatformAdminAccess(pool, req, res);
    if (!r) return;
    const { user } = r;

    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "Invalid org slug" });

    const schema = z.object({ notes: z.string().max(4000).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const notes = parsed.data.notes ? String(parsed.data.notes).trim() : null;

    const updated = await pool.query(
      `
      UPDATE organizations
         SET verification_required = FALSE,
             verification_status = 'approved',
             verified_at = NOW(),
             verified_by_user_id = $2,
             verification_notes = $3,
             updated_at = NOW()
       WHERE slug = $1
       RETURNING slug
      `,
      [slug, String((user as any).id), notes]
    );

    if ((updated.rowCount ?? 0) === 0) return res.status(404).json({ message: "Organization not found" });
    return res.json({ ok: true });
  })
);


app.post(
  "/v1/admin/org-verification/:slug/reject",
  wrap(async (req: any, res: any) => {
    const r = await requirePlatformAdminAccess(pool, req, res);
    if (!r) return;
    const { user } = r;

    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "Invalid org slug" });

    const schema = z.object({ notes: z.string().max(4000).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const notes = parsed.data.notes ? String(parsed.data.notes).trim() : null;

    const updated = await pool.query(
      `
      UPDATE organizations
         SET verification_required = TRUE,
             verification_status = 'rejected',
             verification_notes = $2,
             updated_at = NOW()
       WHERE slug = $1
       RETURNING slug
      `,
      [slug, notes]
    );

    if ((updated.rowCount ?? 0) === 0) return res.status(404).json({ message: "Organization not found" });
    return res.json({ ok: true });
  })
);
}
