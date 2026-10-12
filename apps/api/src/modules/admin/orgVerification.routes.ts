/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Platform-admin organization verification (ORG-02, GOV-02): submitted → approved, needs_info
 * (the org answers and resubmits), rejected (with reasons; resubmitting is the appeal route), and
 * suspension (no publishing, no hour approvals, listings hidden) with reinstatement.
 * Every decision carries a reason the organization's admins see.
 */
import type { Express } from "express";
import { z } from "zod";
import { requirePlatformAdmin as requirePlatformAdminAccess } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { notify } from "../notifications/service";

async function tellOrgAdmins(slug: string, title: string, body: string) {
  const r = await pool.query("SELECT user_id FROM organization_members WHERE org_slug = $1 AND status = 'active' AND role = 'admin' AND user_id IS NOT NULL", [slug]);
  for (const m of r.rows) {
    await notify(String(m.user_id), "request_updates", {
      title,
      body,
      href: "/org/settings",
      email: { subject: title, heading: title, lines: [body || "See Organization settings for details."], cta: { label: "Open Organization settings", url: "/org/settings" } }
    });
  }
}

export function registerAdminOrgVerificationRoutes(app: Express) {
  app.get(
    "/v1/admin/org-verification/queue",
    wrap(async (req, res) => {
      const r = await requirePlatformAdminAccess(pool, req, res);
      if (!r) return;
      const rows = await pool.query(
        `SELECT slug, name, contact_email, verification_required, verification_status, verification_submitted_at, verification_submission_notes,
                verification_notes, verified_at, suspended_at, suspended_reason, updated_at
           FROM organizations
          WHERE verification_status IN ('required', 'submitted', 'needs_info', 'rejected', 'suspended') OR suspended_at IS NOT NULL
          ORDER BY CASE verification_status WHEN 'submitted' THEN 0 ELSE 1 END, COALESCE(verification_submitted_at, updated_at) DESC
          LIMIT 200`
      );
      return res.json({ orgs: rows.rows });
    })
  );

  const decision = (route: string, fn: (slug: string, adminId: string, notes: string | null) => Promise<{ status: number; body: any }>, notesRequired: boolean) =>
    app.post(
      route,
      wrap(async (req: any, res: any) => {
        const r = await requirePlatformAdminAccess(pool, req, res);
        if (!r) return;
        const slug = String(req.params.slug || "").trim();
        if (!slug) return res.status(400).json({ message: "Invalid org slug" });
        const parsed = z.object({ notes: z.string().trim().max(4000).optional() }).safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
        const notes = parsed.data.notes || null;
        if (notesRequired && !notes) return res.status(422).json({ message: "Give the organization a reason; they see it" });
        const out = await fn(slug, String((r.user as any).id), notes);
        res.locals.audit = { action: `org.${route.split("/").pop()!.replace("-", "_")}`, targetType: "organization", targetId: slug, details: { notes } };
        return res.status(out.status).json(out.body);
      })
    );

  decision(
    "/v1/admin/org-verification/:slug/approve",
    async (slug, adminId, notes) => {
      const u = await pool.query(
        `UPDATE organizations SET verification_required = FALSE, verification_status = 'approved', verified_at = NOW(), verified_by_user_id = $2,
                verification_notes = $3, updated_at = NOW()
          WHERE slug = $1 AND suspended_at IS NULL RETURNING slug`,
        [slug, adminId, notes]
      );
      if (!u.rowCount) return { status: 409, body: { message: "Organization not found, or suspended (reinstate it instead)" } };
      await tellOrgAdmins(slug, "Your organization is verified", notes ?? "You can publish requests and approve volunteer hours.");
      return { status: 200, body: { ok: true, status: "approved" } };
    },
    false
  );

  decision(
    "/v1/admin/org-verification/:slug/needs-info",
    async (slug, _adminId, notes) => {
      const u = await pool.query(
        "UPDATE organizations SET verification_status = 'needs_info', verification_notes = $2, updated_at = NOW() WHERE slug = $1 AND suspended_at IS NULL RETURNING slug",
        [slug, notes]
      );
      if (!u.rowCount) return { status: 404, body: { message: "Organization not found" } };
      await tellOrgAdmins(slug, "ThankYou needs more information to verify your organization", notes ?? "");
      return { status: 200, body: { ok: true, status: "needs_info" } };
    },
    true
  );

  decision(
    "/v1/admin/org-verification/:slug/reject",
    async (slug, _adminId, notes) => {
      const u = await pool.query(
        "UPDATE organizations SET verification_required = TRUE, verification_status = 'rejected', verification_notes = $2, updated_at = NOW() WHERE slug = $1 RETURNING slug",
        [slug, notes]
      );
      if (!u.rowCount) return { status: 404, body: { message: "Organization not found" } };
      await tellOrgAdmins(slug, "Your organization's verification was declined", `${notes ?? ""} You can update your details and submit again to ask for another review.`.trim());
      return { status: 200, body: { ok: true, status: "rejected" } };
    },
    true
  );

  decision(
    "/v1/admin/org-verification/:slug/suspend",
    async (slug, _adminId, notes) => {
      const u = await pool.query(
        "UPDATE organizations SET suspended_at = NOW(), suspended_reason = $2, verification_status = 'suspended', updated_at = NOW() WHERE slug = $1 AND suspended_at IS NULL RETURNING slug",
        [slug, notes]
      );
      if (!u.rowCount) return { status: 409, body: { message: "Organization not found or already suspended" } };
      await tellOrgAdmins(slug, "Your organization is suspended", `${notes ?? ""} Your requests are hidden and hours can't be approved until ThankYou reviews this. Reply to this notice to ask for a review.`.trim());
      return { status: 200, body: { ok: true, status: "suspended" } };
    },
    true
  );

  decision(
    "/v1/admin/org-verification/:slug/reinstate",
    async (slug, adminId, notes) => {
      const u = await pool.query(
        `UPDATE organizations SET suspended_at = NULL, suspended_reason = NULL,
                verification_status = CASE WHEN verified_at IS NOT NULL THEN 'approved' ELSE 'required' END,
                verification_notes = COALESCE($3, verification_notes), verified_by_user_id = CASE WHEN verified_at IS NOT NULL THEN $2 ELSE verified_by_user_id END, updated_at = NOW()
          WHERE slug = $1 AND suspended_at IS NOT NULL RETURNING verification_status`,
        [slug, adminId, notes]
      );
      if (!u.rowCount) return { status: 409, body: { message: "Organization not found or not suspended" } };
      await tellOrgAdmins(slug, "Your organization is reinstated", notes ?? "");
      return { status: 200, body: { ok: true, status: u.rows[0].verification_status } };
    },
    false
  );
}
