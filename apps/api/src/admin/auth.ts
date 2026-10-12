import { isBanned } from "../lib/ban";
import { mfaRequiredForStaff } from "../lib/env";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import { requireUserBySession } from "../auth/session";

export function authHeaderToken(req: Request) {
  const header = req.header("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function isSuperAdminIdentity(email: string) {
  // SECURITY: Do not grant super-admin based on an email pattern.
  // Super-admin should be assigned explicitly (DB role='super') or via an
  // explicit environment override (SUPER_ADMIN_EMAIL) for emergency recovery.
  const explicit = normalizeEmail(String(process.env.SUPER_ADMIN_EMAIL || ""));
  if (explicit && normalizeEmail(email) === explicit) return true;

  return false;
}

export async function getPlatformAdminRole(pool: Pool, userId: string): Promise<"moderator" | "admin" | "super" | null> {
  const r = await pool.query(
    `SELECT role
       FROM platform_admins
      WHERE user_id = $1
        AND revoked_at IS NULL
      LIMIT 1`,
    [userId]
  );
  if ((r.rowCount ?? 0) === 0) return null;
  const role = String((r.rows[0] as any)?.role || "").toLowerCase();
  return role === "super" ? "super" : role === "admin" ? "admin" : role === "moderator" ? "moderator" : null;
}

function allowlistEmails() {
  // Deprecated: email allowlists are kept only for backwards compatibility.
  // Prefer DB-based roles in platform_admins.
  const allow = String(process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow;
}

export function isAllowlistedAdminEmail(email: string) {
  const allow = allowlistEmails();
  if (allow.length === 0) return false;
  return allow.includes(normalizeEmail(email));
}

export async function getAdminFlags(pool: Pool, user: any) {
  const superByIdentity = isSuperAdminIdentity(String(user?.email || ""));
  const role = await getPlatformAdminRole(pool, String(user?.id || ""));
  const allowlisted = isAllowlistedAdminEmail(String(user?.email || ""));

  const isSuperAdmin = superByIdentity || role === "super";
  const isPlatformAdmin = isSuperAdmin || role === "admin" || allowlisted;
  const isModerator = isPlatformAdmin || role === "moderator";
  return {
    isPlatformAdmin,
    isSuperAdmin,
    isModerator,
    platformAdminRole: isSuperAdmin ? "super" : isPlatformAdmin ? "admin" : role === "moderator" ? "moderator" : null
  };
}

export async function requireAuthedUser(pool: Pool, req: Request, res: Response) {
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
    res.status(403).json({ message: "Account is temporarily suspended", banned_until: (user as any).banned_until });
    return null;
  }

  return user;
}

/** Platform staff must have two-step sign-in on when the deployment requires it (SAFE-05). */
async function staffMfaMissing(pool: Pool, userId: string, res: Response) {
  if (!mfaRequiredForStaff()) return false;
  const r = await pool.query("SELECT mfa_enabled_at FROM users WHERE id = $1", [userId]);
  if (r.rows[0]?.mfa_enabled_at) return false;
  const message = "Turn on two-step sign-in in Settings → Account to use the admin tools.";
  res.status(403).json({ error: { code: "mfa_required", message }, message });
  return true;
}

export async function requirePlatformAdmin(pool: Pool, req: Request, res: Response) {
  const user = await requireAuthedUser(pool, req, res);
  if (!user) return null;

  const flags = await getAdminFlags(pool, user as any);
  if (!flags.isPlatformAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  if (await staffMfaMissing(pool, String((user as any).id), res)) return null;
  return { user, flags };
}

/** Moderation queues (reports, sensitive requests, disputes): moderators and admins. */
export async function requireModerator(pool: Pool, req: Request, res: Response) {
  const user = await requireAuthedUser(pool, req, res);
  if (!user) return null;
  const flags = await getAdminFlags(pool, user as any);
  if (!flags.isModerator) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  if (await staffMfaMissing(pool, String((user as any).id), res)) return null;
  return { user, flags };
}

export async function requireSuperAdmin(pool: Pool, req: Request, res: Response) {
  const r = await requirePlatformAdmin(pool, req, res);
  if (!r) return null;
  if (!r.flags.isSuperAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return r;
}
