import crypto from "crypto";
import { effectiveLegacyRole, type PolicyUser } from "../lib/policy";
import type { Pool } from "pg";

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

/**
 * Session tokens: the browser holds a random UUID; the database stores only `session_key(token)`
 * (derived from SHA-256), so a copy of the sessions table can't be used to sign in.
 */
export async function createSession(pool: Pool, userId: string) {
  const token = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO sessions (user_id, session_token, expires_at)
     VALUES ($1, session_key($3), NOW() + ($2::text || ' days')::interval)
     RETURNING expires_at`,
    [userId, SESSION_DAYS, token]
  );
  return { sessionToken: token, expiresAt: rows[0].expires_at as string };
}

export async function deleteSession(pool: Pool, sessionToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionToken)) return;
  await pool.query("DELETE FROM sessions WHERE session_token = session_key($1)", [sessionToken]);
}

/**
 * Columns of `users` that may leave the API. Explicit on purpose: a new column (for example an
 * internal moderation note) must be added here deliberately before any client can see it.
 */
export const USER_PUBLIC_COLUMNS = [
  "id",
  "email",
  "email_verified_at",
  "phone_verified_at",
  "role",
  "account_type",
  "requester_mode",
  "profile_completed",
  "availability_completed",
  "onboarding_completed",
  "verification_required",
  "verification_status",
  "verification_submitted_at",
  "verified_at",
  "strike_count",
  "banned_until",
  "banned_reason",
  "banned_at",
  "created_at",
  "updated_at"
] as const;

const SELECT_USER = USER_PUBLIC_COLUMNS.map((c) => `u.${c}`).join(", ");

/** Returns the authenticated user for a session token (never includes password hash or admin notes). */
export async function requireUserBySession(pool: Pool, sessionToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionToken)) return null;
  const { rows } = await pool.query(
    `SELECT ${SELECT_USER},
            u.shadow_banned,
            s.active_context,
            ARRAY(SELECT ur.role FROM user_roles ur WHERE ur.user_id = u.id ORDER BY ur.role) AS roles,
            COALESCE((
              SELECT json_agg(json_build_object('slug', m.org_slug, 'name', o.name, 'role', m.role) ORDER BY o.updated_at DESC)
                FROM organization_members m
                JOIN organizations o ON o.slug = m.org_slug
               WHERE m.user_id = u.id AND m.status = 'active'
            ), '[]'::json) AS orgs,
            (SELECT pa.role FROM platform_admins pa WHERE pa.user_id = u.id AND pa.revoked_at IS NULL LIMIT 1) AS platform_role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.session_token = session_key($1) AND s.expires_at > NOW()`,
    [sessionToken]
  );
  if (rows.length === 0) return null;
  return decorateUser(rows[0] as Record<string, any>);
}

/** Adds derived authorization fields (see lib/policy.ts). */
export function decorateUser(row: Record<string, any>) {
  const user = row as Record<string, any> & PolicyUser;
  user.roles = Array.isArray(user.roles) ? user.roles : [];
  user.orgs = Array.isArray(user.orgs) ? user.orgs : [];
  user.platform_role = (user.platform_role as PolicyUser["platform_role"]) || null;
  user.shadow_banned = Boolean(user.shadow_banned);
  user.base_role = user.role ?? null;
  user.trust_tier = user.verification_status === "approved" ? "trusted" : user.email_verified_at ? "basic" : "unverified";
  user.role = effectiveLegacyRole(user);
  return user;
}

/** Sets the context this session acts in. */
export async function setSessionContext(pool: Pool, sessionToken: string, context: string) {
  const orgSlug = context.startsWith("org:") ? context.slice(4) : null;
  await pool.query("UPDATE sessions SET active_context = $2, active_org_slug = COALESCE($3, active_org_slug) WHERE session_token = session_key($1)", [
    sessionToken,
    context,
    orgSlug
  ]);
}
