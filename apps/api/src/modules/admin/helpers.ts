import type express from "express";
import { pool } from "../../lib/db";

export type Wrap = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) => express.RequestHandler;

export function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function parseLimit(input: unknown, defaultLimit: number, maxLimit: number) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return clampInt(Math.floor(n), 1, maxLimit);
}

export function parseOffset(input: unknown) {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function nowIso() {
  return new Date().toISOString();
}

  /**
   * Enforcement on platform staff (moderators, admins, super admins) is for super admins only, so an
   * admin can't lock out a super admin or another admin.
   */
  export async function staffTargetAllowed(targetUserId: string, actorIsSuper: boolean) {
    if (actorIsSuper) return true;
    const t = await pool.query("SELECT 1 FROM platform_admins WHERE user_id::text = $1 AND revoked_at IS NULL", [String(targetUserId)]);
    return !t.rowCount;
  }

  export function ensureNotSelf(targetUserId: string, actingUserId: string) {
    return String(targetUserId) !== String(actingUserId);
  }

  export async function writeEnforcement(
    actingUserId: string,
    targetUserId: string,
    actionType: "strike" | "ban" | "unban" | "clear_strikes",
    reason: string | null,
    notes: string | null,
    banUntil: Date | null
  ) {
    await pool.query(
      `INSERT INTO user_enforcement_actions (target_user_id, action_type, ban_until, reason, notes, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [targetUserId, actionType, banUntil ? banUntil.toISOString() : null, reason, notes, actingUserId]
    );
  }

  export async function ensurePlatformSettingsRow() {
    await pool.query(
      `INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
       VALUES (1, FALSE, NULL, NOW())
       ON CONFLICT (id) DO NOTHING`
    );
  }
