/* eslint-disable @typescript-eslint/no-explicit-any */
import type express from "express";
import type { Pool } from "pg";
import { pool } from "../../lib/db";

export type Wrap = (fn: (req: express.Request, res: express.Response) => Promise<any>) => express.RequestHandler;

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

export let _shareReportsHasModerationCols: boolean | null = null;

export let _shareReportsColsCheckedAt = 0;

export async function shareReportsHaveModerationCols(pool: Pool): Promise<boolean> {
  const now = Date.now();
  if (_shareReportsHasModerationCols !== null && now - _shareReportsColsCheckedAt < 30_000) return _shareReportsHasModerationCols;

  try {
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'share_reports'
          AND column_name = 'status'
        LIMIT 1`
    );
    _shareReportsHasModerationCols = (r.rowCount ?? 0) > 0;
  } catch {
    _shareReportsHasModerationCols = false;
  }
  _shareReportsColsCheckedAt = now;
  return _shareReportsHasModerationCols;
}

export let _shareLinksHasModerationCols: boolean | null = null;

export let _shareLinksColsCheckedAt = 0;

export async function shareLinksHaveModerationCols(pool: Pool): Promise<boolean> {
  const now = Date.now();
  if (_shareLinksHasModerationCols !== null && now - _shareLinksColsCheckedAt < 30_000) return _shareLinksHasModerationCols;

  try {
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'share_links'
          AND column_name = 'moderation_state'
        LIMIT 1`
    );
    _shareLinksHasModerationCols = (r.rowCount ?? 0) > 0;
  } catch {
    _shareLinksHasModerationCols = false;
  }
  _shareLinksColsCheckedAt = now;
  return _shareLinksHasModerationCols;
}

export function nowIso() {
  return new Date().toISOString();
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
    try {
      await pool.query(
        `INSERT INTO user_enforcement_actions (target_user_id, action_type, ban_until, reason, notes, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [targetUserId, actionType, banUntil ? banUntil.toISOString() : null, reason, notes, actingUserId]
      );
    } catch (e: any) {
      // If the optional enforcement log table is not present (e.g., migrations disabled), do not block admin actions.
      if (e && (e.code === "42P01" || e.code === "42703")) return;
      throw e;
    }
  }

  export async function ensurePlatformSettingsRow() {
    await pool.query(
      `INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
       VALUES (1, FALSE, NULL, NOW())
       ON CONFLICT (id) DO NOTHING`
    );
  }
