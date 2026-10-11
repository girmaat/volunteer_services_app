
//  backend/src/routes/org.ts

import { contentDisposition } from "../lib/http";
import type { Application, Request, Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { sha256, randomTokenUrlSafe } from "../auth/crypto";
import { devEmailLink, sendEmail } from "../auth/email";
import { requireUserBySession, createSession } from "../auth/session";

function authHeaderToken(req: Request): string | null {
  const header = req.header("authorization") || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return null;
}

function webBaseUrl() {
  return (process.env.WEB_BASE_URL || "http://localhost:3002").replace(/\/$/, "");
}

type MessagingPermission = "anyone" | "verified_only" | "no_one";

async function getMessagingPermission(pool: Pool, userId: string): Promise<MessagingPermission> {
  const r = await pool.query("SELECT messaging_permission FROM user_privacy_settings WHERE user_id = $1", [userId]);
  const perm = r.rowCount ? String(r.rows[0]?.messaging_permission || "anyone") : "anyone";
  if (perm === "verified_only" || perm === "no_one" || perm === "anyone") return perm;
  return "anyone";
}

async function canSendDirectMessage(pool: Pool, sender: any, recipientUserId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!recipientUserId) return { allowed: false, reason: "Invalid recipient." };
  if (String(sender?.id || "") === String(recipientUserId)) return { allowed: true };
  if (sender?.is_platform_admin) return { allowed: true };

  const perm = await getMessagingPermission(pool, recipientUserId);
  if (perm === "anyone") return { allowed: true };

  if (perm === "verified_only") {
    // Login requires verified email, but keep the check for safety.
    if (sender?.email_verified_at) return { allowed: true };
    return { allowed: false, reason: "Only verified users can message this user." };
  }

  return { allowed: false, reason: "This user is not accepting direct messages right now." };
}

function slugifyOrgSlug(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

type DbQueryable = { query: (text: string, params?: any[]) => Promise<any> };

const _publicColumnsCache = new Map<string, Set<string>>();

async function publicTableExists(db: DbQueryable, table: string): Promise<boolean> {
  const res = await db.query("SELECT to_regclass($1) AS reg", [`public.${table}`]);
  return Boolean(res.rows?.[0]?.reg);
}

async function getPublicColumns(db: DbQueryable, table: string): Promise<Set<string>> {
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

function buildInsertSql(
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

function buildUpdateSql(
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

function pgErrorCode(e: any): string {
  return String((e && (e.code || e.sqlState)) || "");
}



const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
export const orgDocUploadMiddleware = upload.single("file");

type OrgContext = {
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

async function getOrgContextForUser(pool: Pool, userId: string): Promise<OrgContext | null> {
  const rows = await pool.query(
    `
    SELECT
      o.slug, o.name, o.summary, o.location, o.mission, o.website_url, o.contact_email, o.logo_url, o.onboarding_completed, o.updated_at,
      o.verification_required, o.verification_status, o.verification_submitted_at, o.verification_submission_notes, o.verification_notes, o.verified_at,
      m.role, m.status
    FROM organization_members m
    JOIN organizations o ON o.slug = m.org_slug
    WHERE m.user_id = $1 AND m.status = 'active'
    ORDER BY o.updated_at DESC
    LIMIT 1
    `,
    [userId]
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

async function requireOrg(pool: Pool, req: Request, res: Response) {
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

  if (String((user as any).role || "") !== "org_admin") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  const ctx = await getOrgContextForUser(pool, String((user as any).id));
  if (!ctx) {
    res.status(404).json({ message: "Organization membership not found" });
    return null;
  }

  return { token, user, ctx };
}

function requireAdmin(ctx: OrgContext, res: Response) {
  if (ctx.membership.role !== "admin") {
    res.status(403).json({ message: "Admin role required" });
    return false;
  }
  return true;
}

function requireAdminOrManager(ctx: OrgContext, res: Response) {
  if (ctx.membership.role !== "admin" && ctx.membership.role !== "manager") {
    res.status(403).json({ message: "Admin or manager role required" });
    return false;
  }
  return true;
}

export function registerOrgRoutes(app: Application, pool: Pool, wrap: any) {
  // Phase 1+2: Org context (single org by membership; no switching)
  app.get(
    "/v1/org/me",
    wrap(async (req: any, res: any) => {
      const token = authHeaderToken(req);
      if (!token) return res.status(401).json({ message: "Not authenticated" });

      const user = await requireUserBySession(pool, token);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      if (String((user as any).role || "") !== "org_admin") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const ctx = await getOrgContextForUser(pool, String((user as any).id));
      if (!ctx) return res.status(404).json({ message: "Organization membership not found" });
      return res.json(ctx);
    })
  );

  // Legacy endpoint (removed by orgReq)
  app.post(
    "/v1/org/enroll",
    wrap(async (_req: any, res: any) => {
      return res.status(410).json({ message: "Use POST /v1/orgs/enroll (public org signup). Context switching enrollment is removed." });
    })
  );

  // OrgReq Phase 1: Public org enrollment (creates org + first admin user)
  app.post(
    "/v1/orgs/enroll",
    wrap(async (req: any, res: any) => {
      const schema = z.object({
        org: z.object({
          name: z.string().min(2),
          slug: z.string().min(2),
          summary: z.string().min(10),
          location: z.string().min(2),
          mission: z.string().min(2).optional().nullable(),
          website_url: z.string().url().optional().nullable(),
          contact_email: z.string().email()
        }),
        admin: z.object({
          fullName: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(8)
        })
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const orgSlug = slugifyOrgSlug(parsed.data.org.slug);
      if (!orgSlug) return res.status(400).json({ message: "Invalid org slug" });

      const email = parsed.data.admin.email.toLowerCase().trim();

      const existingUser = await pool.query("SELECT id, email_verified_at FROM users WHERE email=$1", [email]);
      if ((existingUser.rowCount ?? 0) > 0) return res.status(409).json({ message: "Email already in use" });

      const existingOrg = await pool.query("SELECT slug FROM organizations WHERE slug=$1", [orgSlug]);
      if ((existingOrg.rowCount ?? 0) > 0) return res.status(409).json({ message: "Organization slug already in use" });

      const passwordHash = await bcrypt.hash(parsed.data.admin.password, 12);

      // Create user (org team member)
      const userRows = await pool.query(
        `INSERT INTO users (email, password_hash, role, account_type, profile_completed, availability_completed, onboarding_completed, verification_required, verification_status)
         VALUES ($1, $2, 'org_admin', 'org_team_member', TRUE, FALSE, TRUE, TRUE, 'required')
         RETURNING id`,
        [email, passwordHash]
      );
      const userId = String(userRows.rows[0].id);

      await pool.query(
        `INSERT INTO user_profiles (user_id, full_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET full_name=EXCLUDED.full_name, updated_at=NOW()`,
        [userId, parsed.data.admin.fullName]
      );

      // Create org
      await pool.query(
        `INSERT INTO organizations (slug, name, summary, location, mission, website_url, contact_email, created_by_user_id, verification_required, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'required')`,
        [
          orgSlug,
          parsed.data.org.name,
          parsed.data.org.summary,
          parsed.data.org.location,
          parsed.data.org.mission ?? null,
          parsed.data.org.website_url ?? null,
          parsed.data.org.contact_email,
          userId
        ]
      );

      // Create membership (admin)
      await pool.query(
        `INSERT INTO organization_members (org_slug, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')
         ON CONFLICT (org_slug, user_id) DO NOTHING`,
        [orgSlug, userId]
      );

      // Email verification (same pattern as /v1/auth/signup)
      const token = randomTokenUrlSafe(32);
      const tokenHash = sha256(token);

      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [userId, tokenHash]
      );

      const verifyUrl = `${webBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
      const delivery = await sendEmail({
        to: email,
        subject: "Verify your ThankYou email",
        text: `Welcome to ThankYou!

Verify your email to continue:
${verifyUrl}

If you didn't create this account, you can ignore this email.`
      });

      const dev_verify_url = devEmailLink(verifyUrl, delivery.delivery);

      return res.status(202).json({ status: "accepted", emailDelivery: delivery.delivery, dev_verify_url });
    })
  );

  // Authenticated org creation (converts an existing requester into an org admin and creates the org + membership)
  app.post(
    "/v1/orgs/create",
    wrap(async (req: any, res: any) => {
      const token = authHeaderToken(req);
      if (!token) return res.status(401).json({ message: "Not authenticated" });

      const user = await requireUserBySession(pool, token);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      // Only authenticated, verified accounts in the requester onboarding flow may create an org this way.
      if (String((user as any).role || "") !== "requester") {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (String((user as any).requester_mode || "") !== "organization") {
        return res.status(400).json({ message: "Requester mode must be 'organization' to create an org" });
      }

      if (!(user as any).profile_completed) {
        return res.status(400).json({ message: "Complete your profile before creating an organization" });
      }

      const schema = z.object({
        org: z.object({
          name: z.string().min(2),
          slug: z.string().min(2),
          summary: z.string().min(10),
          location: z.string().min(2),
          mission: z.string().min(2).optional().nullable(),
          website_url: z.string().url().optional().nullable(),
          contact_email: z.string().email()
        })
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const orgSlug = slugifyOrgSlug(parsed.data.org.slug);
      if (!orgSlug) return res.status(400).json({ message: "Invalid org slug" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Guard: schema may be partially migrated. We dynamically write only columns that exist.
        const hasOrgs = await publicTableExists(client, "organizations");
        const hasMembers = await publicTableExists(client, "organization_members");
        const hasUsers = await publicTableExists(client, "users");

        if (!hasOrgs || !hasMembers || !hasUsers) {
          await client.query("ROLLBACK");
          return res.status(500).json({
            message: "Database schema is missing required organization tables. Run backend migrations (owner role) and retry."
          });
        }

        const orgCols = await getPublicColumns(client, "organizations");
        const memberCols = await getPublicColumns(client, "organization_members");
        const userCols = await getPublicColumns(client, "users");

        if (!orgCols.has("slug")) {
          await client.query("ROLLBACK");
          return res.status(500).json({
            message: "Database schema for organizations is incomplete (missing organizations.slug). Run migrations and retry."
          });
        }

        const existingOrg = await client.query("SELECT slug FROM organizations WHERE slug=$1", [orgSlug]);
        if ((existingOrg.rowCount ?? 0) > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "Organization slug already in use" });
        }

        // Create org (write only columns present in the current schema)
        const orgInsert = buildInsertSql(
          "organizations",
          {
            slug: orgSlug,
            name: parsed.data.org.name,
            summary: parsed.data.org.summary,
            location: parsed.data.org.location,
            mission: parsed.data.org.mission ?? null,
            website_url: parsed.data.org.website_url ?? null,
            contact_email: parsed.data.org.contact_email,
            created_by_user_id: String((user as any).id),
            verification_required: true,
            verification_status: "required",
            onboarding_completed: false
          },
          orgCols,
          ["slug", "name", "summary", "location"]
        );

        await client.query(orgInsert.sql, orgInsert.params);

        // Create membership (admin)
        const memberInsert = buildInsertSql(
          "organization_members",
          {
            org_slug: orgSlug,
            user_id: String((user as any).id),
            role: "admin",
            status: "active",
            joined_at: new Date()
          },
          memberCols,
          ["org_slug", "user_id"]
        );

        // Use ON CONFLICT DO NOTHING to be tolerant of varying constraint names.
        await client.query(`${memberInsert.sql} ON CONFLICT DO NOTHING`, memberInsert.params);

        // Convert account to org admin (mutually exclusive from individual requester)
        const userUpdate = buildUpdateSql(
          "users",
          "id",
          String((user as any).id),
          {
            role: "org_admin",
            account_type: "org_team_member",
            verification_required: true,
            verification_status: "required",
            updated_at: new Date()
          },
          userCols,
          ["id", "role"]
        );

        await client.query(userUpdate.sql, userUpdate.params);

        await client.query("COMMIT");
        return res.status(201).json({ org: { slug: orgSlug } });
      } catch (e: any) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {}

        const code = pgErrorCode(e);
        if (code === "23505") {
          return res.status(409).json({ message: "Organization slug already in use" });
        }

        if (code === "42P01" || code === "42703") {
          return res.status(500).json({
            message: "Database schema appears out of date for organization features. Run backend migrations (owner role) and retry."
          });
        }

        throw e;
      } finally {
        client.release();
      }
    })
  );





// OrgReq Phase 1.5: Join an existing org by email-domain match (authenticated org requester/team member).
// This prevents users from bypassing org setup by landing on /dashboard without org context.
app.post(
  "/v1/orgs/join",
  wrap(async (req: any, res: any) => {
    const token = authHeaderToken(req);
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const user = await requireUserBySession(pool, token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const role = String((user as any).role || "");
    const requesterMode = String((user as any).requester_mode || "");

    // Only org-requester accounts (requester_mode=organization) or existing org_admin accounts may join.
    if (role === "requester") {
      if (requesterMode !== "organization") {
        return res.status(400).json({ message: "Requester mode must be 'organization' to join an organization" });
      }
    } else if (role !== "org_admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!(user as any).profile_completed) {
      return res.status(400).json({ message: "Complete your profile before joining an organization" });
    }

    // No switching: if already active in any org, block join.
    const existing = await pool.query(
      "SELECT org_slug FROM organization_members WHERE user_id=$1 AND status='active' LIMIT 1",
      [String((user as any).id)]
    );
    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: "Already a member of an organization" });
    }

    const schema = z.object({
      orgSlug: z.string().min(2)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const orgSlug = slugifyOrgSlug(parsed.data.orgSlug);
    if (!orgSlug) return res.status(400).json({ message: "Invalid org slug" });

    
    const orgCols = await getPublicColumns(pool as any, "organizations");
    const selectContact = orgCols.has("contact_email") ? "contact_email" : "NULL::text AS contact_email";
    const selectWebsite = orgCols.has("website_url") ? "website_url" : "NULL::text AS website_url";

    const orgRes = await pool.query(
      `SELECT slug, ${selectContact}, ${selectWebsite} FROM organizations WHERE slug=$1`,
      [orgSlug]
    );

if ((orgRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Organization not found" });

    const org = orgRes.rows[0] as any;

    function normalizeDomain(d: string) {
      const s = String(d || "").toLowerCase().trim();
      return s.startsWith("www.") ? s.slice(4) : s;
    }

    const userEmail = String((user as any).email || "").toLowerCase().trim();
    const userDomain = normalizeDomain(userEmail.split("@")[1] || "");

    let orgDomain = "";
    if (org.contact_email) {
      orgDomain = normalizeDomain(String(org.contact_email).split("@")[1] || "");
    } else if (org.website_url) {
      try {
        const u = new URL(String(org.website_url));
        orgDomain = normalizeDomain(u.hostname);
      } catch {
        orgDomain = "";
      }
    }

    if (!orgDomain) {
      return res.status(400).json({
        message: "This organization is not configured for domain-based join. Ask an admin to add you."
      });
    }

    if (!userDomain || userDomain !== orgDomain) {
      return res.status(403).json({
        message: "Your email domain does not match this organization. Ask an admin to add you."
      });
    }

    await pool.query(
      `INSERT INTO organization_members (org_slug, user_id, role, status, joined_at)
       VALUES ($1, $2, 'member', 'active', NOW())
       ON CONFLICT (org_slug, user_id) DO UPDATE SET status='active', joined_at=COALESCE(organization_members.joined_at, NOW()), updated_at=NOW()`,
      [orgSlug, String((user as any).id)]
    );

    // Convert account to org admin (mutually exclusive from individual requester).
    await pool.query(
      `UPDATE users
         SET role='org_admin',
             account_type='org_team_member',
             verification_required=TRUE,
             verification_status='required',
             updated_at=NOW()
       WHERE id=$1`,
      [String((user as any).id)]
    );

    return res.status(201).json({ org: { slug: orgSlug } });
  })
);

  // Phase 2: Change org slug (admin only). This updates all FK references.
  app.post(
    "/v1/orgs/:orgSlug/slug",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (ok.ctx.org.slug !== String(req.params.orgSlug)) return res.status(404).json({ message: "Org not found" });
      if (!requireAdmin(ok.ctx, res)) return;

      const schema = z.object({ slug: z.string().min(2) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const newSlug = slugifyOrgSlug(parsed.data.slug);
      if (!newSlug) return res.status(400).json({ message: "Invalid org slug" });

      const oldSlug = ok.ctx.org.slug;
      if (newSlug === oldSlug) return res.json({ org: { slug: oldSlug } });

      const existingOrg = await pool.query("SELECT slug FROM organizations WHERE slug=$1", [newSlug]);
      if ((existingOrg.rowCount ?? 0) > 0) return res.status(409).json({ message: "Organization slug already in use" });

      // To avoid FK violations (no ON UPDATE CASCADE), we create a new org row, repoint refs, then delete the old row.
      await pool.query("BEGIN");
      try {
        const orgRow = await pool.query(
          `
          INSERT INTO organizations (slug, name, summary, location, mission, website_url, contact_email, logo_url, onboarding_completed, created_by_user_id, verification_required, verification_status, verification_submitted_at, verification_submission_notes, verification_notes, verified_at, verified_by_user_id, created_at, updated_at)
          SELECT $2, name, summary, location, mission, website_url, contact_email, logo_url, onboarding_completed, created_by_user_id, verification_required, verification_status, verification_submitted_at, verification_submission_notes, verification_notes, verified_at, verified_by_user_id, created_at, updated_at
          FROM organizations
          WHERE slug = $1
          RETURNING slug
          `,
          [oldSlug, newSlug]
        );
        if ((orgRow.rowCount ?? 0) === 0) {
          await pool.query("ROLLBACK");
          return res.status(404).json({ message: "Org not found" });
        }

        await pool.query("UPDATE organization_members SET org_slug=$2 WHERE org_slug=$1", [oldSlug, newSlug]);

        // Optional columns exist in our schema migrations; safe to update.
        await pool.query("UPDATE sessions SET active_org_slug=$2 WHERE active_org_slug=$1", [oldSlug, newSlug]);
        await pool.query("UPDATE opportunities SET organization_slug=$2 WHERE organization_slug=$1", [oldSlug, newSlug]);
        await pool.query("UPDATE service_requests SET requester_org_slug=$2 WHERE requester_org_slug=$1", [oldSlug, newSlug]);

        await pool.query("DELETE FROM organizations WHERE slug=$1", [oldSlug]);
        await pool.query("COMMIT");
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }

      const ctx = await getOrgContextForUser(pool, String((ok.user as any).id));
      return res.json({ org: ctx?.org ? { slug: ctx.org.slug } : { slug: newSlug } });
    })
  );

  // Phase 2: Update org profile (admin only)
  app.patch(
    "/v1/orgs/:orgSlug",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (ok.ctx.org.slug !== String(req.params.orgSlug)) return res.status(404).json({ message: "Org not found" });
      if (!requireAdmin(ok.ctx, res)) return;

      // Load current org so we can validate completion rules against the post-update shape.
      const currentOrgRes = await pool.query(
        "SELECT slug, name, summary, location, contact_email, mission, website_url, logo_url, onboarding_completed FROM organizations WHERE slug=$1",
        [ok.ctx.org.slug]
      );
      if ((currentOrgRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Org not found" });
      const currentOrg = currentOrgRes.rows[0] as any;

      const schema = z.object({
        name: z.string().min(2).optional(),
        summary: z.string().min(10).optional(),
        location: z.string().min(2).optional(),
        mission: z.string().min(2).optional().nullable(),
        website_url: z.string().url().optional().nullable(),
        contact_email: z.string().email().optional(),
        logo_url: z.string().url().optional().nullable(),
        onboarding_completed: z.boolean().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const p = parsed.data;

      const finalName = p.name ?? String(currentOrg.name || "");
      const finalSummary = p.summary ?? String(currentOrg.summary || "");
      const finalLocation = p.location ?? String(currentOrg.location || "");
      const finalContactEmail = (typeof p.contact_email === "string" ? p.contact_email : currentOrg.contact_email) as
        | string
        | null;

      // Enforce spec minimums when finishing onboarding.
      if (p.onboarding_completed === true && !currentOrg.onboarding_completed) {
        if (!finalName || finalName.trim().length < 2) {
          return res.status(400).json({ message: "Organization name is required" });
        }
        if (!finalLocation || finalLocation.trim().length < 2) {
          return res.status(400).json({ message: "Organization location is required" });
        }
        if (!finalSummary || finalSummary.trim().length < 10) {
          return res.status(400).json({ message: "Organization summary is required" });
        }
        if (!finalContactEmail) {
          return res.status(400).json({ message: "Contact email is required" });
        }

        // Also require minimal admin personal profile (name + phone) before org onboarding can complete.
        const adminProfileRes = await pool.query(
          "SELECT full_name, phone FROM user_profiles WHERE user_id=$1",
          [String((ok.user as any).id)]
        );
        const adminProfile = adminProfileRes.rows[0] as any;
        const adminNameOk = Boolean(String(adminProfile?.full_name || "").trim());
        const adminPhoneOk = Boolean(String(adminProfile?.phone || "").trim());
        if (!adminNameOk || !adminPhoneOk) {
          return res.status(400).json({ message: "Admin profile (name and phone) must be completed before finishing organization onboarding" });
        }
      }

      await pool.query(
        `
        UPDATE organizations
        SET
          name = COALESCE($2, name),
          summary = COALESCE($3, summary),
          location = COALESCE($4, location),
          mission = COALESCE($5, mission),
          website_url = COALESCE($6, website_url),
          contact_email = COALESCE($7, contact_email),
          logo_url = COALESCE($8, logo_url),
          onboarding_completed = COALESCE($9, onboarding_completed),
          updated_at = NOW()
        WHERE slug = $1
        `,
        [
          ok.ctx.org.slug,
          p.name ?? null,
          p.summary ?? null,
          p.location ?? null,
          p.mission ?? null,
          p.website_url ?? null,
          typeof p.contact_email === "string" ? p.contact_email : null,
          p.logo_url ?? null,
          typeof p.onboarding_completed === "boolean" ? p.onboarding_completed : null
        ]
      );

      const ctx = await getOrgContextForUser(pool, String((ok.user as any).id));
      return res.json(ctx);
    })
  );

  // Phase 3/4: Dashboard tiles
  // Phase 2b: Org verification submission (admin only)
  app.post(
    "/v1/orgs/:orgSlug/verification/submit",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (ok.ctx.org.slug !== String(req.params.orgSlug)) return res.status(404).json({ message: "Org not found" });
      if (!requireAdmin(ok.ctx, res)) return;

      const schema = z.object({
        submission_notes: z.string().max(4000).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const notes = parsed.data.submission_notes ? String(parsed.data.submission_notes).trim() : null;

      const cur = await pool.query("SELECT verification_status FROM organizations WHERE slug=$1", [ok.ctx.org.slug]);
      const status = (cur.rows?.[0]?.verification_status ? String(cur.rows[0].verification_status) : "not_required").toLowerCase();
      if (status === "approved" || status === "verified") {
        return res.status(409).json({ message: "Organization is already verified." });
      }

      await pool.query(
        `
        UPDATE organizations
           SET verification_required=TRUE,
               verification_status='submitted',
               verification_submitted_at=NOW(),
               verification_submission_notes=$2,
               updated_at=NOW()
         WHERE slug=$1
        `,
        [ok.ctx.org.slug, notes]
      );

      const ctx = await getOrgContextForUser(pool, String((ok.user as any).id));
      return res.json({ ok: true, org: ctx?.org ?? ok.ctx.org });
    })
  );


    app.get(
    "/v1/org/dashboard",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const orgSlug = ok.ctx.org.slug;

      const [openReq, pendingApps, members, unread, recentReq, recentApps] = await Promise.all([
        pool.query(
          "SELECT COUNT(*)::int AS c FROM service_requests WHERE requester_org_slug = $1 AND status IN ('open','paused')",
          [orgSlug]
        ),
        pool.query(
          `
          SELECT COUNT(*)::int AS c
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_org_slug = $1 AND a.status IN ('pending','waitlisted')
          `,
          [orgSlug]
        ),
        pool.query("SELECT COUNT(*)::int AS c FROM organization_members WHERE org_slug=$1 AND status='active'", [orgSlug]),
        pool.query(
          `
          SELECT COUNT(*)::int AS c
          FROM direct_messages d
          WHERE d.recipient_user_id IN (
            SELECT user_id FROM organization_members WHERE org_slug=$1 AND status='active' AND user_id IS NOT NULL
          )
          AND d.read_at IS NULL
          `,
          [orgSlug]
        ),
        pool.query(
          `
          WITH apps AS (
            SELECT
              a.request_id,
              COUNT(*)::int AS applications_total,
              COUNT(*) FILTER (WHERE a.status = 'pending')::int AS applications_pending
            FROM request_applications a
            GROUP BY a.request_id
          )
          SELECT
            r.id,
            r.title,
            r.status,
            r.updated_at,
            COALESCE(apps.applications_total, 0)::int AS applications_total,
            COALESCE(apps.applications_pending, 0)::int AS applications_pending
          FROM service_requests r
          LEFT JOIN apps ON apps.request_id = r.id
          WHERE r.requester_org_slug=$1
          ORDER BY r.updated_at DESC
          LIMIT 6
          `,
          [orgSlug]
        ),
        pool.query(
          `
          SELECT
            a.id AS application_id,
            a.status,
            a.updated_at,
            r.id AS request_id,
            r.title AS request_title,
            v.id AS volunteer_user_id,
            v.email AS volunteer_email,
            vp.display_name AS volunteer_display_name,
            COALESCE(vp.public_location, vp.location) AS volunteer_public_location
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          JOIN users v ON v.id = a.volunteer_user_id
          LEFT JOIN user_profiles vp ON vp.user_id = v.id
          WHERE r.requester_org_slug = $1
          ORDER BY a.updated_at DESC
          LIMIT 6
          `,
          [orgSlug]
        )
      ]);

      return res.json({
        org: ok.ctx.org,
        openRequests: Number(openReq.rows[0]?.c ?? 0),
        pendingApplications: Number(pendingApps.rows[0]?.c ?? 0),
        unreadMessages: Number(unread.rows[0]?.c ?? 0),
        activeMembers: Number(members.rows[0]?.c ?? 0),
        recentRequests: recentReq.rows,
        recentApplications: recentApps.rows
      });
    })
  );



  // Phase 1/4: Members (existing UI uses these; kept)
  app.get(
    "/v1/org/members",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const rows = await pool.query(
        `
        SELECT
          m.id AS member_id,
          m.user_id,
          COALESCE(u.email, m.invited_email) AS email,
          m.invited_email,
          p.full_name,
          m.role,
          m.status,
          m.created_at,
          m.updated_at
        FROM organization_members m
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE m.org_slug = $1
        ORDER BY
          CASE m.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
          COALESCE(p.full_name, u.email, m.invited_email) ASC
        `,
        [ok.ctx.org.slug]
      );

      return res.json({ org: ok.ctx.org, membership: ok.ctx.membership, members: rows.rows });
    })
  );

  
  app.post(
    "/v1/org/members",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const schema = z.object({
        email: z.string().email(),
        role: z.enum(["member", "manager", "admin"]).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const email = String(parsed.data.email || "").trim().toLowerCase();
      const role = (parsed.data.role || "member") as any;

      // If they're already an active member, just update role.
      const active = await pool.query(
        `
        SELECT m.id
        FROM organization_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.org_slug = $1 AND m.status = 'active' AND lower(u.email) = $2
        LIMIT 1
        `,
        [ok.ctx.org.slug, email]
      );

      if ((active.rowCount ?? 0) > 0) {
        await pool.query("UPDATE organization_members SET role=$2, updated_at=NOW() WHERE id=$1", [String(active.rows[0].id), role]);
        return res.json({ ok: true, status: "already_member" });
      }

      // Create or refresh an invite (works for both existing and new accounts).
      const token = randomTokenUrlSafe(32);
      const tokenHash = sha256(token);

      const inviteRow = await pool.query(
        `
        INSERT INTO organization_members (org_slug, invited_email, role, status, invited_at, invite_token_hash, invite_sent_at, invite_expires_at)
        VALUES ($1, $2, $3, 'invited', NOW(), $4, NOW(), NOW() + INTERVAL '14 days')
        ON CONFLICT (org_slug, invited_email)
        DO UPDATE SET role=EXCLUDED.role,
                      status='invited',
                      invited_at=NOW(),
                      invite_token_hash=EXCLUDED.invite_token_hash,
                      invite_sent_at=NOW(),
                      invite_expires_at=EXCLUDED.invite_expires_at,
                      updated_at=NOW()
        RETURNING id
        `,
        [ok.ctx.org.slug, email, role, tokenHash]
      );

      const inviteUrl = `${webBaseUrl()}/org/invite?token=${encodeURIComponent(token)}`;
      const subject = `You're invited to join ${ok.ctx.org.name} on ThankYou`;
      const body = [
        `You've been invited to join ${ok.ctx.org.name} as a ${role}.`,
        ``,
        `Accept invite: ${inviteUrl}`,
        ``,
        `If you already have an individual volunteer/requester account, we recommend using a separate org-team account to keep modes separate.`
      ].join("\n");

      let devInviteUrl: string | null = null;
      try {
        await sendEmail({ to: email, subject, text: body });
      } catch (_e) {
        // Local dev fallback when SMTP isn't configured.
        devInviteUrl = inviteUrl;
      }

      return res.status(201).json({ ok: true, status: "invited", member_id: inviteRow.rows?.[0]?.id, dev_invite_url: devInviteUrl });
    })
  );

  // Cancel a pending invite (admin/manager only)
  app.delete(
    "/v1/org/members/invites/:memberId",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const idParsed = z.string().uuid().safeParse(req.params.memberId);
      if (!idParsed.success) return res.status(400).json({ message: "Invalid member id" });

      await pool.query(
        "DELETE FROM organization_members WHERE id=$1 AND org_slug=$2 AND status='invited'",
        [idParsed.data, ok.ctx.org.slug]
      );

      return res.json({ ok: true });
    })
  );

  // Resend an invite (admin/manager only)
  app.post(
    "/v1/org/members/invites/:memberId/resend",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const idParsed = z.string().uuid().safeParse(req.params.memberId);
      if (!idParsed.success) return res.status(400).json({ message: "Invalid member id" });

      const row = await pool.query(
        `
        SELECT m.id, m.invited_email, m.role
        FROM organization_members m
        WHERE m.id=$1 AND m.org_slug=$2 AND m.status='invited'
        LIMIT 1
        `,
        [idParsed.data, ok.ctx.org.slug]
      );
      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Invite not found" });

      const token = randomTokenUrlSafe(32);
      const tokenHash = sha256(token);
      await pool.query(
        "UPDATE organization_members SET invite_token_hash=$2, invite_sent_at=NOW(), invite_expires_at=NOW() + INTERVAL '14 days', updated_at=NOW() WHERE id=$1",
        [idParsed.data, tokenHash]
      );

      const inviteUrl = `${webBaseUrl()}/org/invite?token=${encodeURIComponent(token)}`;
      const inviteEmail = String(row.rows[0].invited_email || "").trim().toLowerCase();
      const role = String(row.rows[0].role || "member");

      const subject = `Reminder: join ${ok.ctx.org.name} on ThankYou`;
      const body = [
        `You're invited to join ${ok.ctx.org.name} as a ${role}.`,
        ``,
        `Accept invite: ${inviteUrl}`
      ].join("\n");

      let devInviteUrl: string | null = null;
      try {
        await sendEmail({ to: inviteEmail, subject, text: body });
      } catch (_e) {
        devInviteUrl = inviteUrl;
      }

      return res.json({ ok: true, dev_invite_url: devInviteUrl });
    })
  );

  // Public: show invite details for a token (used by /org/invite page).
  app.get(
    "/v1/public/org-invites/lookup",
    wrap(async (req: any, res: any) => {
      const token = String(req.query.token || "").trim();
      if (!token) return res.status(400).json({ message: "Missing token" });

      const tokenHash = sha256(token);
      const row = await pool.query(
        `
        SELECT m.org_slug, m.role, m.invited_email, m.invite_expires_at, o.name AS org_name
        FROM organization_members m
        JOIN organizations o ON o.slug = m.org_slug
        WHERE m.status='invited' AND m.invite_token_hash=$1 AND (m.invite_expires_at IS NULL OR m.invite_expires_at > NOW())
        LIMIT 1
        `,
        [tokenHash]
      );
      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Invite not found" });

      const r = row.rows[0] as any;
      return res.json({
        org: { slug: String(r.org_slug), name: String(r.org_name) },
        role: String(r.role),
        invited_email: r.invited_email ? String(r.invited_email) : null,
        expires_at: r.invite_expires_at ? String(r.invite_expires_at) : null
      });
    })
  );

  // Accept an invite (requires login).
  app.post(
    "/v1/org/invites/accept",
    wrap(async (req: any, res: any) => {
      const sessionToken = authHeaderToken(req);
      if (!sessionToken) return res.status(401).json({ message: "Not authenticated" });

      const user = await requireUserBySession(pool, sessionToken);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const schema = z.object({ token: z.string().min(8) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const tokenHash = sha256(String(parsed.data.token).trim());

      const invite = await pool.query(
        `
        SELECT m.id, m.org_slug, m.role, m.invited_email, m.invite_expires_at, o.name AS org_name
        FROM organization_members m
        JOIN organizations o ON o.slug = m.org_slug
        WHERE m.status='invited' AND m.invite_token_hash=$1 AND (m.invite_expires_at IS NULL OR m.invite_expires_at > NOW())
        LIMIT 1
        `,
        [tokenHash]
      );
      if ((invite.rowCount ?? 0) === 0) return res.status(404).json({ message: "Invite not found" });

      const inv = invite.rows[0] as any;
      const invitedEmail = String(inv.invited_email || "").trim().toLowerCase();
      const userEmail = String((user as any).email || "").trim().toLowerCase();
      if (invitedEmail && userEmail !== invitedEmail) {
        return res.status(403).json({ message: "This invite was sent to a different email address." });
      }

      // Ensure this user can become an org team member.
      const u = await pool.query("SELECT id, role, requester_mode, account_type FROM users WHERE id=$1", [String((user as any).id)]);
      if ((u.rowCount ?? 0) === 0) return res.status(401).json({ message: "Not authenticated" });
      const ur = u.rows[0] as any;

      const role = String(ur.role || "");
      const requesterMode = String(ur.requester_mode || "");
      const accountType = String(ur.account_type || "");

      if (role === "volunteer" || accountType === "volunteer") {
        return res.status(409).json({ message: "This invite requires an org-team account. Please sign in with an org-team account email." });
      }
      if (role === "requester" && requesterMode !== "organization") {
        return res.status(409).json({ message: "This invite requires an org-team account. Please use a separate org-team account email." });
      }

      await pool.query("BEGIN");
      try {
        // If user already has membership, update it; otherwise, convert the invite row to the active membership.
        const existing = await pool.query(
          "SELECT id FROM organization_members WHERE org_slug=$1 AND user_id=$2 LIMIT 1",
          [String(inv.org_slug), String((user as any).id)]
        );

        if ((existing.rowCount ?? 0) > 0) {
          await pool.query(
            "UPDATE organization_members SET role=$2, status='active', joined_at=COALESCE(joined_at, NOW()), updated_at=NOW() WHERE id=$1",
            [String(existing.rows[0].id), String(inv.role)]
          );
          await pool.query("DELETE FROM organization_members WHERE id=$1", [String(inv.id)]);
        } else {
          await pool.query(
            `
            UPDATE organization_members
            SET user_id=$2,
                status='active',
                joined_at=COALESCE(joined_at, NOW()),
                invite_accepted_at=NOW(),
                invite_token_hash=NULL,
                invite_sent_at=NULL,
                invite_expires_at=NULL,
                updated_at=NOW()
            WHERE id=$1
            `,
            [String(inv.id), String((user as any).id)]
          );
        }

        // Convert to org team member (mutually exclusive from individual requester).
        await pool.query(
          `UPDATE users
             SET role='org_admin',
                 account_type='org_team_member',
                 onboarding_completed=TRUE,
                 verification_required=TRUE,
                 verification_status='required',
                 updated_at=NOW()
           WHERE id=$1`,
          [String((user as any).id)]
        );

        await pool.query("COMMIT");
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }

      return res.json({ ok: true, org: { slug: String(inv.org_slug), name: String(inv.org_name) } });
    })
  );

app.patch(
    "/v1/org/members/:userId",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdmin(ok.ctx, res)) return;

      const params = z.object({ userId: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid user id" });

      const schema = z.object({ role: z.enum(["admin", "manager", "member"]) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      await pool.query(
        "UPDATE organization_members SET role=$3, updated_at=NOW() WHERE org_slug=$1 AND user_id=$2",
        [ok.ctx.org.slug, params.data.userId, parsed.data.role]
      );

      return res.json({ ok: true });
    })
  );

  app.delete(
    "/v1/org/members/:userId",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdmin(ok.ctx, res)) return;

      const params = z.object({ userId: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid user id" });

      const targetId = params.data.userId;

      // Prevent removing last admin
      const admins = await pool.query(
        "SELECT COUNT(*)::int AS c FROM organization_members WHERE org_slug=$1 AND role='admin' AND status='active'",
        [ok.ctx.org.slug]
      );
      const n = Number(admins.rows[0]?.c ?? 0);
      if (n <= 1) return res.status(409).json({ message: "You are the last admin; add another admin first." });

      await pool.query("DELETE FROM organization_members WHERE org_slug=$1 AND user_id=$2", [ok.ctx.org.slug, targetId]);
      return res.json({ ok: true });
    })
  );

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

      const insert = await pool.query(
        `
        INSERT INTO service_requests
          (requester_user_id, requester_org_slug, title, description, status, location_text, mode, needed_by, tags)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, '{}'::text[]))
        RETURNING *
        `,
        [
          String((ok.user as any).id),
          ok.ctx.org.slug,
          p.title,
          p.description,
          p.status ?? "open",
          p.location_text ?? null,
          p.mode ?? null,
          p.needed_by ?? null,
          p.tags ?? null
        ]
      );

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
          status = COALESCE($5, status),
          location_text = COALESCE($6, location_text),
          mode = COALESCE($7, mode),
          needed_by = COALESCE($8::timestamptz, needed_by),
          tags = COALESCE($9, tags),
          updated_at = NOW()
        WHERE requester_org_slug=$1 AND id=$2
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

      const upd = await pool.query(
        "UPDATE service_requests SET status='closed', updated_at=NOW() WHERE requester_org_slug=$1 AND id=$2 RETURNING id",
        [ok.ctx.org.slug, params.data.id]
      );
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Not found" });
      return res.json({ ok: true });
    })
  );

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

  // Volunteer roster: unique volunteers across requests, with counts + optional filters.
  app.get(
    "/v1/org/roster",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          status: z.string().optional(), // active | waitlisted | completed | all
          requestId: z.string().uuid().optional(),
          search: z.string().optional()
        })
        .safeParse(req.query);

      const status = q.success && q.data.status ? String(q.data.status) : "active";
      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const search = q.success && q.data.search ? String(q.data.search) : null;

      const statuses =
        status === "waitlisted"
          ? ["waitlisted"]
          : status === "completed"
            ? ["completed"]
            : status === "all"
              ? ["pending", "accepted", "waitlisted", "rejected", "withdrawn", "confirmed", "completed", "canceled"]
              : ["accepted", "confirmed"]; // default active

      const rows = await pool.query(
        `
        SELECT
          v.id AS volunteer_user_id,
          v.email AS volunteer_email,
          vp.display_name AS volunteer_display_name,
          vp.avatar_url AS volunteer_avatar_url,
          COALESCE(vp.public_location, vp.location) AS volunteer_public_location,
          COUNT(*) FILTER (WHERE a.status IN ('accepted','confirmed'))::int AS active_count,
          COUNT(*) FILTER (WHERE a.status = 'waitlisted')::int AS waitlisted_count,
          COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed_count,
          COUNT(*)::int AS total_count,
          MAX(a.updated_at) AS last_activity_at,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.title), NULL) AS request_titles
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        JOIN users v ON v.id = a.volunteer_user_id
        LEFT JOIN user_profiles vp ON vp.user_id = v.id
        WHERE r.requester_org_slug = $1
          AND a.status = ANY($2::text[])
          AND ($3::uuid IS NULL OR r.id = $3::uuid)
          AND (
            $4::text IS NULL
            OR v.email ILIKE '%' || $4 || '%'
            OR COALESCE(vp.display_name,'') ILIKE '%' || $4 || '%'
          )
        GROUP BY v.id, v.email, vp.display_name, vp.avatar_url, vp.public_location, vp.location
        ORDER BY last_activity_at DESC NULLS LAST, volunteer_email ASC
        `,
        [ok.ctx.org.slug, statuses, requestId, search]
      );

      return res.json({
        roster: rows.rows,
        filters: { status, requestId, search }
      });
    })
  );


  // Org Operations: Attendance Tracking (check-in/out + hours)
  app.get(
    "/v1/org/attendance",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          requestId: z.string().uuid().optional(),
          volunteerUserId: z.string().uuid().optional(),
          status: z.enum(["open", "closed", "all"]).optional(),
          from: z.string().optional(),
          to: z.string().optional()
        })
        .safeParse(req.query);

      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const volunteerUserId = q.success && q.data.volunteerUserId ? String(q.data.volunteerUserId) : null;
      const status = q.success && q.data.status ? q.data.status : "all";
      const from = q.success && q.data.from ? new Date(String(q.data.from)) : null;
      const to = q.success && q.data.to ? new Date(String(q.data.to)) : null;

      const rows = await pool.query(
        `
        SELECT
          l.id,
          l.org_slug,
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
        WHERE l.org_slug = $1
          AND ($2::uuid IS NULL OR l.request_id = $2::uuid)
          AND ($3::uuid IS NULL OR l.volunteer_user_id = $3::uuid)
          AND (
            $4::text = 'all'
            OR ($4::text = 'open' AND l.check_out_at IS NULL)
            OR ($4::text = 'closed' AND l.check_out_at IS NOT NULL)
          )
          AND ($5::timestamptz IS NULL OR l.check_in_at >= $5::timestamptz)
          AND ($6::timestamptz IS NULL OR l.check_in_at <= $6::timestamptz)
        ORDER BY l.check_in_at DESC
        LIMIT 500
        `,
        [ok.ctx.org.slug, requestId, volunteerUserId, status, from && !Number.isNaN(from.getTime()) ? from.toISOString() : null, to && !Number.isNaN(to.getTime()) ? to.toISOString() : null]
      );

      return res.json({ attendance: rows.rows });
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

  app.post(
    "/v1/org/attendance/manual",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const body = z
        .object({
          application_id: z.string().uuid(),
          check_in_at: z.string().min(1),
          check_out_at: z.string().optional(),
          hours: z.number().optional(),
          notes: z.string().max(5000).optional()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      const checkIn = new Date(body.data.check_in_at);
      if (Number.isNaN(checkIn.getTime())) return res.status(400).json({ message: "Invalid check_in_at" });
      const checkOut = body.data.check_out_at ? new Date(body.data.check_out_at) : null;
      if (checkOut && Number.isNaN(checkOut.getTime())) return res.status(400).json({ message: "Invalid check_out_at" });

      const appRow = await pool.query(
        `
        SELECT a.id, a.request_id, a.volunteer_user_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.requester_org_slug = $2
        LIMIT 1
        `,
        [body.data.application_id, ok.ctx.org.slug]
      );
      if ((appRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

      const requestId = String(appRow.rows[0]?.request_id);
      const volunteerUserId = String(appRow.rows[0]?.volunteer_user_id);

      const derivedHours =
        typeof body.data.hours === "number"
          ? body.data.hours
          : checkOut
            ? Math.round(((checkOut.getTime() - checkIn.getTime()) / 3600000) * 100) / 100
            : null;

      const inserted = await pool.query(
        `
        INSERT INTO org_attendance_logs (org_slug, request_id, request_application_id, volunteer_user_id, check_in_at, check_out_at, hours, notes, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        `,
        [ok.ctx.org.slug, requestId, body.data.application_id, volunteerUserId, checkIn.toISOString(), checkOut ? checkOut.toISOString() : null, derivedHours, body.data.notes ?? null, String((ok.user as any).id)]
      );

      return res.status(201).json({ attendance: inserted.rows[0] });
    })
  );

  // Org Operations: Incident Reports
  app.get(
    "/v1/org/incidents",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
          severity: z.enum(["low", "medium", "high", "critical"]).optional(),
          requestId: z.string().uuid().optional(),
          search: z.string().optional()
        })
        .safeParse(req.query);

      const status = q.success && q.data.status ? String(q.data.status) : null;
      const severity = q.success && q.data.severity ? String(q.data.severity) : null;
      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const search = q.success && q.data.search ? String(q.data.search) : null;

      const rows = await pool.query(
        `
        SELECT
          i.*,
          r.title AS request_title,
          u.email AS volunteer_email,
          up.display_name AS volunteer_display_name
        FROM org_incident_reports i
        LEFT JOIN service_requests r ON r.id = i.request_id
        LEFT JOIN users u ON u.id = i.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = i.volunteer_user_id
        WHERE i.org_slug = $1
          AND ($2::text IS NULL OR i.status = $2)
          AND ($3::text IS NULL OR i.severity = $3)
          AND ($4::uuid IS NULL OR i.request_id = $4::uuid)
          AND (
            $5::text IS NULL
            OR i.title ILIKE '%' || $5 || '%'
            OR i.description ILIKE '%' || $5 || '%'
            OR COALESCE(up.display_name,'') ILIKE '%' || $5 || '%'
            OR COALESCE(u.email,'') ILIKE '%' || $5 || '%'
          )
        ORDER BY i.created_at DESC
        LIMIT 500
        `,
        [ok.ctx.org.slug, status, severity, requestId, search]
      );

      return res.json({ incidents: rows.rows });
    })
  );

  app.post(
    "/v1/org/incidents",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const body = z
        .object({
          request_id: z.string().uuid().optional(),
          application_id: z.string().uuid().optional(),
          volunteer_user_id: z.string().uuid().optional(),
          title: z.string().trim().min(2).max(200),
          description: z.string().trim().min(5).max(20000),
          severity: z.enum(["low", "medium", "high", "critical"]).optional()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      let requestId = body.data.request_id ? String(body.data.request_id) : null;
      const applicationId = body.data.application_id ? String(body.data.application_id) : null;
      let volunteerUserId = body.data.volunteer_user_id ? String(body.data.volunteer_user_id) : null;

      if (applicationId) {
        const a = await pool.query(
          `
          SELECT a.request_id, a.volunteer_user_id
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE a.id = $1 AND r.requester_org_slug = $2
          LIMIT 1
          `,
          [applicationId, ok.ctx.org.slug]
        );
        if ((a.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });
        requestId = String(a.rows[0]?.request_id);
        volunteerUserId = String(a.rows[0]?.volunteer_user_id);
      } else if (requestId) {
        const r = await pool.query("SELECT 1 FROM service_requests WHERE id=$1 AND requester_org_slug=$2", [requestId, ok.ctx.org.slug]);
        if ((r.rowCount ?? 0) === 0) return res.status(404).json({ message: "Request not found" });
      } else {
        return res.status(400).json({ message: "request_id or application_id is required" });
      }

      const inserted = await pool.query(
        `
        INSERT INTO org_incident_reports (org_slug, request_id, request_application_id, volunteer_user_id, title, description, severity, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        `,
        [
          ok.ctx.org.slug,
          requestId,
          applicationId,
          volunteerUserId,
          body.data.title,
          body.data.description,
          body.data.severity ?? "medium",
          String((ok.user as any).id)
        ]
      );

      return res.status(201).json({ incident: inserted.rows[0] });
    })
  );

  app.get(
    "/v1/org/incidents/:id",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid incident id" });

      const row = await pool.query(
        `
        SELECT
          i.*,
          r.title AS request_title,
          u.email AS volunteer_email,
          up.display_name AS volunteer_display_name
        FROM org_incident_reports i
        LEFT JOIN service_requests r ON r.id = i.request_id
        LEFT JOIN users u ON u.id = i.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = i.volunteer_user_id
        WHERE i.org_slug = $1 AND i.id = $2
        LIMIT 1
        `,
        [ok.ctx.org.slug, params.data.id]
      );

      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Incident not found" });

      return res.json({ incident: row.rows[0] });
    })
  );

  app.patch(
    "/v1/org/incidents/:id",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid incident id" });

      const body = z
        .object({
          title: z.string().trim().min(2).max(200).optional(),
          description: z.string().trim().min(5).max(20000).optional(),
          severity: z.enum(["low", "medium", "high", "critical"]).optional(),
          status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
          internal_notes: z.string().max(20000).optional().nullable(),
          outcome: z.string().max(20000).optional().nullable()
        })
        .safeParse(req.body);

      if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

      const upd = await pool.query(
        `
        UPDATE org_incident_reports
        SET
          title = COALESCE($3, title),
          description = COALESCE($4, description),
          severity = COALESCE($5, severity),
          status = COALESCE($6, status),
          internal_notes = CASE WHEN $7::text IS NULL THEN internal_notes ELSE $7::text END,
          outcome = CASE WHEN $8::text IS NULL THEN outcome ELSE $8::text END,
          updated_at = NOW()
        WHERE org_slug = $1 AND id = $2
        RETURNING *
        `,
        [
          ok.ctx.org.slug,
          params.data.id,
          body.data.title ?? null,
          body.data.description ?? null,
          body.data.severity ?? null,
          body.data.status ?? null,
          body.data.internal_notes ?? null,
          body.data.outcome ?? null
        ]
      );

      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Incident not found" });

      return res.json({ incident: upd.rows[0] });
    })
  );

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
        }
      }
      

      const upd = await pool.query(
        `
        UPDATE request_applications a
        SET
          status = COALESCE($3, status),
          assigned_to_user_id = COALESCE($4::uuid, assigned_to_user_id),
          status_updated_at = CASE WHEN $3 IS NULL THEN status_updated_at ELSE NOW() END,
          status_updated_by_user_id = CASE WHEN $3 IS NULL THEN status_updated_by_user_id ELSE $2::uuid END,
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

      return res.json({ ok: true, status: "completed" });
    })
  );

  // Phase 4.4: Reporting (impact/outcomes + volunteer hours summary)
  app.get(
    "/v1/org/reports/impact",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          from: z.string().optional(),
          to: z.string().optional()
        })
        .safeParse(req.query);

      const from = q.success && q.data.from ? new Date(String(q.data.from)) : null;
      const to = q.success && q.data.to ? new Date(String(q.data.to)) : null;

      const fromIso = from && !Number.isNaN(from.getTime()) ? from.toISOString() : null;
      const toIso = to && !Number.isNaN(to.getTime()) ? to.toISOString() : null;

      const [reqCounts, appCounts, attendanceCounts, topRequests, completedApps] = await Promise.all([
        pool.query(
          `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'open')::int AS open,
            COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
            COUNT(*) FILTER (WHERE status = 'closed')::int AS closed
          FROM service_requests
          WHERE requester_org_slug = $1
            AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE a.status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE a.status = 'accepted')::int AS accepted,
            COUNT(*) FILTER (WHERE a.status = 'waitlisted')::int AS waitlisted,
            COUNT(*) FILTER (WHERE a.status = 'rejected')::int AS rejected,
            COUNT(*) FILTER (WHERE a.status = 'withdrawn')::int AS withdrawn,
            COUNT(*) FILTER (WHERE a.status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_org_slug = $1
            AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR a.created_at <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE check_out_at IS NULL)::int AS open_sessions,
            COUNT(*) FILTER (WHERE check_out_at IS NOT NULL)::int AS closed_sessions,
            ROUND(COALESCE(SUM(COALESCE(hours, 0)), 0)::numeric, 2) AS total_hours,
            COUNT(DISTINCT volunteer_user_id)::int AS unique_volunteers
          FROM org_attendance_logs
          WHERE org_slug = $1
            AND ($2::timestamptz IS NULL OR check_in_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR check_in_at <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT
            r.id AS request_id,
            r.title AS request_title,
            ROUND(COALESCE(SUM(COALESCE(l.hours, 0)), 0)::numeric, 2) AS total_hours,
            COUNT(*)::int AS sessions
          FROM org_attendance_logs l
          JOIN service_requests r ON r.id = l.request_id
          WHERE l.org_slug = $1
            AND ($2::timestamptz IS NULL OR l.check_in_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR l.check_in_at <= $3::timestamptz)
          GROUP BY r.id, r.title
          ORDER BY total_hours DESC NULLS LAST, sessions DESC
          LIMIT 10
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT COUNT(*)::int AS completed_engagements
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_org_slug = $1
            AND a.status = 'completed'
            AND ($2::timestamptz IS NULL OR COALESCE(a.status_updated_at, a.updated_at) >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR COALESCE(a.status_updated_at, a.updated_at) <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        )
      ]);

      const requests = reqCounts.rows?.[0] || {};
      const applications = appCounts.rows?.[0] || {};
      const attendance = attendanceCounts.rows?.[0] || {};
      const completedEngagements = Number(completedApps.rows?.[0]?.completed_engagements || 0);

      return res.json({
        range: { from: fromIso, to: toIso },
        requests: {
          total: Number(requests.total || 0),
          open: Number(requests.open || 0),
          paused: Number(requests.paused || 0),
          closed: Number(requests.closed || 0)
        },
        applications: {
          total: Number(applications.total || 0),
          pending: Number(applications.pending || 0),
          accepted: Number(applications.accepted || 0),
          waitlisted: Number(applications.waitlisted || 0),
          rejected: Number(applications.rejected || 0),
          withdrawn: Number(applications.withdrawn || 0),
          confirmed: Number(applications.confirmed || 0),
          completed: Number(applications.completed || 0)
        },
        outcomes: {
          completed_engagements: completedEngagements,
          unique_volunteers: Number(attendance.unique_volunteers || 0),
          open_checkins: Number(attendance.open_sessions || 0),
          closed_sessions: Number(attendance.closed_sessions || 0),
          total_hours: Number(attendance.total_hours || 0)
        },
        top_opportunities_by_hours: topRequests.rows || []
      });
    })
  );

  app.get(
    "/v1/org/reports/volunteer-hours",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          requestId: z.string().uuid().optional(),
          from: z.string().optional(),
          to: z.string().optional()
        })
        .safeParse(req.query);

      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const from = q.success && q.data.from ? new Date(String(q.data.from)) : null;
      const to = q.success && q.data.to ? new Date(String(q.data.to)) : null;

      const fromIso = from && !Number.isNaN(from.getTime()) ? from.toISOString() : null;
      const toIso = to && !Number.isNaN(to.getTime()) ? to.toISOString() : null;

      const rows = await pool.query(
        `
        SELECT
          l.volunteer_user_id,
          u.email AS volunteer_email,
          up.display_name AS volunteer_display_name,
          COUNT(*) FILTER (WHERE l.check_out_at IS NULL)::int AS open_sessions,
          COUNT(*) FILTER (WHERE l.check_out_at IS NOT NULL)::int AS closed_sessions,
          ROUND(COALESCE(SUM(COALESCE(l.hours, 0)), 0)::numeric, 2) AS total_hours,
          MAX(COALESCE(l.check_out_at, l.check_in_at)) AS last_activity_at
        FROM org_attendance_logs l
        LEFT JOIN users u ON u.id = l.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = l.volunteer_user_id
        WHERE l.org_slug = $1
          AND ($2::uuid IS NULL OR l.request_id = $2::uuid)
          AND ($3::timestamptz IS NULL OR l.check_in_at >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR l.check_in_at <= $4::timestamptz)
        GROUP BY l.volunteer_user_id, u.email, up.display_name
        ORDER BY total_hours DESC NULLS LAST, last_activity_at DESC NULLS LAST, volunteer_email ASC
        LIMIT 500
        `,
        [ok.ctx.org.slug, requestId, fromIso, toIso]
      );

      const total = rows.rows.reduce((s: number, r: any) => s + Number(r.total_hours || 0), 0);

      return res.json({
        range: { from: fromIso, to: toIso },
        request_id: requestId,
        total_hours: Math.round(total * 100) / 100,
        volunteers: rows.rows
      });
    })
  );

  // Phase 4.3: Org inbox (shared view over direct_messages scoped to org members)
  app.get(
    "/v1/org/messages/inbox",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const orgSlug = ok.ctx.org.slug;

            const rows = await pool.query(
        `
        WITH org_users AS (
          SELECT user_id
          FROM organization_members
          WHERE org_slug = $1 AND status='active' AND user_id IS NOT NULL
        ),
        relevant AS (
          SELECT d.*
          FROM direct_messages d
          WHERE d.sender_user_id IN (SELECT user_id FROM org_users)
             OR d.recipient_user_id IN (SELECT user_id FROM org_users)
        ),
        peers AS (
          SELECT
            CASE
              WHEN d.sender_user_id IN (SELECT user_id FROM org_users) THEN d.recipient_user_id
              ELSE d.sender_user_id
            END AS peer_id,
            d.request_id,
            d.application_id,
            MAX(d.created_at) AS last_at
          FROM relevant d
          GROUP BY 1, d.request_id, d.application_id
        )
        SELECT
          p.peer_id,
          p.request_id,
          p.application_id,
          r.title AS request_title,
          u.email AS peer_email,
          up.display_name AS peer_display_name,
          up.avatar_url AS peer_avatar_url,
          (SELECT body FROM relevant d2
            WHERE (
              (d2.sender_user_id IN (SELECT user_id FROM org_users) AND d2.recipient_user_id = p.peer_id)
              OR (d2.recipient_user_id IN (SELECT user_id FROM org_users) AND d2.sender_user_id = p.peer_id)
            )
            AND d2.request_id IS NOT DISTINCT FROM p.request_id
            AND d2.application_id IS NOT DISTINCT FROM p.application_id
            ORDER BY d2.created_at DESC
            LIMIT 1
          ) AS last_body,
          p.last_at,
          (SELECT COUNT(*)::int FROM relevant du
            WHERE du.sender_user_id = p.peer_id
              AND du.recipient_user_id IN (SELECT user_id FROM org_users)
              AND du.read_at IS NULL
              AND du.request_id IS NOT DISTINCT FROM p.request_id
              AND du.application_id IS NOT DISTINCT FROM p.application_id
          ) AS unread_count,
          (SELECT du.sender_user_id FROM relevant du
            WHERE (
              (du.sender_user_id IN (SELECT user_id FROM org_users) AND du.recipient_user_id = p.peer_id)
              OR (du.recipient_user_id IN (SELECT user_id FROM org_users) AND du.sender_user_id = p.peer_id)
            )
            AND du.request_id IS NOT DISTINCT FROM p.request_id
            AND du.application_id IS NOT DISTINCT FROM p.application_id
            ORDER BY du.created_at DESC
            LIMIT 1
          ) AS last_sender_user_id
        FROM peers p
        JOIN users u ON u.id = p.peer_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN service_requests r ON r.id = p.request_id
        ORDER BY p.last_at DESC
        `,
        [orgSlug]
      );

      return res.json({ threads: rows.rows });
    })
  );

  
app.get(
  "/v1/org/messages/thread/:peerId",
  wrap(async (req: any, res: any) => {
    const ok = await requireOrg(pool, req, res);
    if (!ok) return;

    const params = z.object({ peerId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return res.status(400).json({ message: "Invalid peer id" });

    const orgSlug = ok.ctx.org.slug;
    const peerId = params.data.peerId;

    const ctxSchema = z.object({
      requestId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional()
    });

    const ctxParsed = ctxSchema.safeParse({
      requestId: typeof req.query.requestId === "string" ? req.query.requestId : undefined,
      applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined
    });

    if (!ctxParsed.success) return res.status(400).json({ message: "Invalid context params" });

    let requestId: string | null = ctxParsed.data.requestId ?? null;
    const applicationId: string | null = ctxParsed.data.applicationId ?? null;

    let context: any = null;

    if (applicationId) {
      const a = await pool.query(
        `
        SELECT
          a.request_id,
          a.volunteer_user_id,
          r.title AS request_title,
          r.requester_org_slug
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });
      const row = a.rows[0];

      if (String(row.requester_org_slug) !== orgSlug) {
        return res.status(403).json({ message: "You do not have access to this application." });
      }
      if (String(row.volunteer_user_id) !== peerId) {
        return res.status(403).json({ message: "Invalid application context for this peer." });
      }

      requestId = requestId ?? String(row.request_id);
      if (requestId !== String(row.request_id)) {
        return res.status(400).json({ message: "Context mismatch (application vs request)." });
      }

      context = {
        request_id: requestId,
        request_title: row.request_title,
        application_id: applicationId
      };
    }

    if (requestId && !context) {
      const r = await pool.query("SELECT id, title FROM service_requests WHERE id = $1 AND requester_org_slug = $2", [
        requestId,
        orgSlug
      ]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const okApp = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (okApp.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }

      context = { request_id: String(r.rows[0].id), request_title: r.rows[0].title, application_id: applicationId };
    }

    const msgs = await pool.query(
      `
      WITH org_users AS (
        SELECT user_id
        FROM organization_members
        WHERE org_slug = $1 AND status='active' AND user_id IS NOT NULL
      )
      SELECT
        d.id,
        d.sender_user_id,
        d.recipient_user_id,
        d.request_id,
        d.application_id,
        d.body,
        d.created_at,
        d.read_at,
        sp.full_name AS sender_full_name
      FROM direct_messages d
      LEFT JOIN user_profiles sp ON sp.user_id = d.sender_user_id
      WHERE
        (
          (d.sender_user_id IN (SELECT user_id FROM org_users) AND d.recipient_user_id = $2)
          OR
          (d.recipient_user_id IN (SELECT user_id FROM org_users) AND d.sender_user_id = $2)
        )
        AND d.request_id IS NOT DISTINCT FROM $3::uuid
        AND d.application_id IS NOT DISTINCT FROM $4::uuid
      ORDER BY d.created_at ASC
      `,
      [orgSlug, peerId, requestId, applicationId]
    );

    // Mark messages to *this* org member as read (per-recipient, context-scoped)
    await pool.query(
      `
      UPDATE direct_messages
      SET read_at = NOW()
      WHERE sender_user_id = $2::uuid
        AND recipient_user_id = $1::uuid
        AND read_at IS NULL
        AND request_id IS NOT DISTINCT FROM $3::uuid
        AND application_id IS NOT DISTINCT FROM $4::uuid
      `,
      [String((ok.user as any).id), peerId, requestId, applicationId]
    );

    return res.json({ context, messages: msgs.rows });
  })
);

app.post(
  "/v1/org/messages/thread/:peerId",
  wrap(async (req: any, res: any) => {
    const ok = await requireOrg(pool, req, res);
    if (!ok) return;

    const params = z.object({ peerId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return res.status(400).json({ message: "Invalid peer id" });

    const orgSlug = ok.ctx.org.slug;
    const peerId = params.data.peerId;

    const ctxSchema = z.object({
      requestId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional()
    });

    const ctxParsed = ctxSchema.safeParse({
      requestId: typeof req.query.requestId === "string" ? req.query.requestId : undefined,
      applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined
    });

    if (!ctxParsed.success) return res.status(400).json({ message: "Invalid context params" });

    let requestId: string | null = ctxParsed.data.requestId ?? null;
    const applicationId: string | null = ctxParsed.data.applicationId ?? null;

    if (applicationId) {
      const a = await pool.query(
        `
        SELECT a.request_id, a.volunteer_user_id, r.requester_org_slug
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });
      const row = a.rows[0];

      if (String(row.requester_org_slug) !== orgSlug) {
        return res.status(403).json({ message: "You do not have access to this application." });
      }
      if (String(row.volunteer_user_id) !== peerId) {
        return res.status(403).json({ message: "Invalid application context for this peer." });
      }

      requestId = requestId ?? String(row.request_id);
      if (requestId !== String(row.request_id)) {
        return res.status(400).json({ message: "Context mismatch (application vs request)." });
      }
    }

    if (requestId) {
      const r = await pool.query("SELECT id FROM service_requests WHERE id = $1 AND requester_org_slug = $2", [requestId, orgSlug]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const okApp = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (okApp.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }
    }

    const schema = z.object({ body: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const perm = await canSendDirectMessage(pool, ok.user, peerId);
    if (!perm.allowed) {
      return res.status(403).json({ message: perm.reason || "This user is not accepting direct messages." });
    }

    const insert = await pool.query(
      `
      INSERT INTO direct_messages (sender_user_id, recipient_user_id, request_id, application_id, body)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)
      RETURNING id, sender_user_id, recipient_user_id, body, created_at, read_at
      `,
      [String((ok.user as any).id), peerId, requestId, applicationId, parsed.data.body]
    );

    return res.status(201).json(insert.rows[0]);
  })
);


}


