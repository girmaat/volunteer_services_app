import { can, contextOrgSlug, type PolicyUser } from "../../lib/policy";
/* eslint-disable @typescript-eslint/no-explicit-any */
import multer from "multer";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import { requireUserBySession } from "../../auth/session";
import { pool } from "../../lib/db";

export function authHeaderToken(req: Request): string | null {
  const header = req.header("authorization") || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return null;
}

export function webBaseUrl() {
  return (process.env.WEB_BASE_URL || "http://localhost:3002").replace(/\/$/, "");
}

export function slugifyOrgSlug(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export type DbQueryable = { query: (text: string, params?: any[]) => Promise<any> };

export const _publicColumnsCache = new Map<string, Set<string>>();

export async function publicTableExists(db: DbQueryable, table: string): Promise<boolean> {
  const res = await db.query("SELECT to_regclass($1) AS reg", [`public.${table}`]);
  return Boolean(res.rows?.[0]?.reg);
}

export async function getPublicColumns(db: DbQueryable, table: string): Promise<Set<string>> {
  const cached = _publicColumnsCache.get(table);
  if (cached) return cached;

  const res = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    [table]
  );
  const cols = new Set<string>((res.rows || []).map((r: any) => String(r.column_name)));
  _publicColumnsCache.set(table, cols);
  return cols;
}

export function buildInsertSql(
  table: string,
  values: Record<string, any>,
  allowedColumns: Set<string>,
  requiredColumns: string[]
) {
  const cols: string[] = [];
  const params: any[] = [];
  const placeholders: string[] = [];

  for (const col of requiredColumns) {
    if (!allowedColumns.has(col)) {
      throw new Error(`Database schema missing required column ${table}.${col}`);
    }
  }

  let i = 1;
  for (const [k, v] of Object.entries(values)) {
    if (!allowedColumns.has(k)) continue;
    cols.push(k);
    params.push(v);
    placeholders.push(`$${i++}`);
  }

  if (cols.length === 0) throw new Error(`No writable columns found for ${table}`);

  return {
    sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
    params
  };
}

export function buildUpdateSql(
  table: string,
  keyColumn: string,
  keyValue: any,
  updates: Record<string, any>,
  allowedColumns: Set<string>,
  requiredColumns: string[]
) {
  for (const col of requiredColumns) {
    if (!allowedColumns.has(col)) {
      throw new Error(`Database schema missing required column ${table}.${col}`);
    }
  }

  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;

  for (const [k, v] of Object.entries(updates)) {
    if (!allowedColumns.has(k)) continue;
    sets.push(`${k}=$${i++}`);
    params.push(v);
  }

  if (sets.length === 0) {
    // Nothing to update - still treat as success.
    return { sql: `SELECT 1`, params: [] as any[] };
  }

  params.push(keyValue);
  return {
    sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE ${keyColumn}=$${i}`,
    params
  };
}

export function pgErrorCode(e: any): string {
  return String((e && (e.code || e.sqlState)) || "");
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
  };
  membership: {
    role: "admin" | "manager" | "member";
    status: "active" | "invited";
  };
};

export async function getOrgContextForUser(pool: Pool, userId: string, preferredSlug?: string | null): Promise<OrgContext | null> {
  const rows = await pool.query(
    `
    SELECT
      o.slug, o.name, o.summary, o.location, o.mission, o.website_url, o.contact_email, o.logo_url, o.onboarding_completed, o.updated_at,
      o.verification_required, o.verification_status, o.verification_submitted_at, o.verification_submission_notes, o.verification_notes, o.verified_at,
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

  const r = rows.rows[0] as any;
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
      verified_at: r.verified_at ? String(r.verified_at) : null
    },
    membership: {
      role: String(r.role) as any,
      status: String(r.status) as any
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

  if (!can(user as PolicyUser, "org:act")) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  (user as any).role = "org_admin";

  const ctx = await getOrgContextForUser(pool, String((user as any).id), contextOrgSlug((user as any).active_context));
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

export function requireAdminOrManager(ctx: OrgContext, res: Response) {
  if (ctx.membership.role !== "admin" && ctx.membership.role !== "manager") {
    res.status(403).json({ message: "Admin or manager role required" });
    return false;
  }
  return true;
}
