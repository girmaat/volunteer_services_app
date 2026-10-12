import { isBanned } from "../../lib/ban";
import { can, contextOrgSlug, type PolicyUser } from "../../lib/policy";
import multer from "multer";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import { requireUserBySession } from "../../auth/session";

export function authHeaderToken(req: Request): string | null {
  const header = req.header("authorization") || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return null;
}

export function webBaseUrl() {
  return (process.env.WEB_BASE_URL || "http://localhost:3202").replace(/\/$/, "");
}

export function slugifyOrgSlug(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function pgErrorCode(e: unknown): string {
  const x = (e ?? {}) as { code?: unknown; sqlState?: unknown };
  return String(x.code || x.sqlState || "");
}

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const orgDocUploadMiddleware = upload.single("file");

export type OrgContext = {
  org: {
    slug: string;
    name: string;
    summary: string;
    location: string;
    mission: string | null;
    website_url: string | null;
    contact_email: string | null;
    logo_url: string | null;
    onboarding_completed: boolean;
    updated_at: string;
    verification_required: boolean;
    verification_status: string;
    verification_submitted_at: string | null;
    verification_submission_notes: string | null;
    verification_notes: string | null;
    verified_at: string | null;
    preferred_skills: string[];
    service_area: string | null;
    hours: string | null;
    contact_phone: string | null;
    preferred_contact_method: string | null;
    publication_policy: string;
    org_type: string;
    suspended_at: string | null;
    suspended_reason: string | null;
  };
  membership: {
    role: "admin" | "manager" | "member" | "coordinator";
    status: "active" | "invited";
  };
};

export async function getOrgContextForUser(pool: Pool, userId: string, preferredSlug?: string | null): Promise<OrgContext | null> {
  const rows = await pool.query(
    `
    SELECT
      o.slug, o.name, o.summary, o.location, o.mission, o.website_url, o.contact_email, o.logo_url, o.onboarding_completed, o.updated_at,
      o.verification_required, o.verification_status, o.verification_submitted_at, o.verification_submission_notes, o.verification_notes, o.verified_at,
      o.preferred_skills, o.service_area, o.hours, o.contact_phone, o.preferred_contact_method,
      o.publication_policy, o.org_type, o.suspended_at, o.suspended_reason,
      m.role, m.status
    FROM organization_members m
    JOIN organizations o ON o.slug = m.org_slug
    WHERE m.user_id = $1 AND m.status = 'active'
    ORDER BY (o.slug = $2) DESC, o.updated_at DESC
    LIMIT 1
    `,
    [userId, preferredSlug || ""]
  );

  if ((rows.rowCount ?? 0) === 0) return null;

  const r = rows.rows[0];
  return {
    org: {
      slug: String(r.slug),
      name: String(r.name),
      summary: String(r.summary),
      location: String(r.location),
      mission: r.mission ? String(r.mission) : null,
      website_url: r.website_url ? String(r.website_url) : null,
      contact_email: r.contact_email ? String(r.contact_email) : null,
      logo_url: r.logo_url ? String(r.logo_url) : null,
      onboarding_completed: Boolean(r.onboarding_completed),
      updated_at: String(r.updated_at),
      verification_required: Boolean(r.verification_required),
      verification_status: String(r.verification_status || "not_required"),
      verification_submitted_at: r.verification_submitted_at ? String(r.verification_submitted_at) : null,
      verification_submission_notes: r.verification_submission_notes ? String(r.verification_submission_notes) : null,
      verification_notes: r.verification_notes ? String(r.verification_notes) : null,
      verified_at: r.verified_at ? String(r.verified_at) : null,
      preferred_skills: Array.isArray(r.preferred_skills) ? r.preferred_skills : [],
      service_area: r.service_area ?? null,
      hours: r.hours ?? null,
      contact_phone: r.contact_phone ?? null,
      preferred_contact_method: r.preferred_contact_method ?? null,
      publication_policy: String(r.publication_policy || "owner_first_and_high_risk"),
      org_type: String(r.org_type || "nonprofit"),
      suspended_at: r.suspended_at ? String(r.suspended_at) : null,
      suspended_reason: r.suspended_reason ?? null
    },
    membership: {
      role: String(r.role) as OrgContext["membership"]["role"],
      status: String(r.status) as OrgContext["membership"]["status"]
    }
  };
}

export async function requireOrg(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  const user = await requireUserBySession(pool, token);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  if (isBanned(user)) {
    res.status(403).json({ message: "Account is banned", banned_until: user.banned_until });
    return null;
  }

  if (!can(user as PolicyUser, "org:act")) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  user.role = "org_admin";

  const ctx = await getOrgContextForUser(pool, String(user.id), contextOrgSlug(user.active_context));
  if (!ctx) {
    res.status(404).json({ message: "Organization membership not found" });
    return null;
  }

  return { token, user, ctx };
}

export function requireAdmin(ctx: OrgContext, res: Response) {
  if (ctx.membership.role !== "admin") {
    res.status(403).json({ message: "Admin role required" });
    return false;
  }
  return true;
}

/** Volunteers' emails and phone numbers are for admins and managers; members and coordinators don't see them. */
export function seesContacts(ctx: OrgContext) {
  return ctx.membership.role === "admin" || ctx.membership.role === "manager";
}

const CONTACT_KEYS = ["email", "phone", "volunteer_email", "volunteer_phone"] as const;

/** Rows with volunteer contact fields cleared when this staff member may not see them. */
export function contactsFor<T extends Record<string, unknown>>(ctx: OrgContext, rows: T[]): T[] {
  if (seesContacts(ctx)) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const k of CONTACT_KEYS) if (k in out) out[k] = null;
    return out as T;
  });
}

export function requireAdminOrManager(ctx: OrgContext, res: Response) {
  if (ctx.membership.role !== "admin" && ctx.membership.role !== "manager") {
    res.status(403).json({ message: "Admin or manager role required" });
    return false;
  }
  return true;
}
