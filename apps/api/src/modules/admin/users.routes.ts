/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requirePlatformAdmin, requireSuperAdmin } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { ensureNotSelf, parseLimit, parseOffset, writeEnforcement, staffTargetAllowed } from "./helpers";

export function registerAdminUsersRoutes(app: Express) {


  // User management
  
  // User management
  app.get(
    "/v1/admin/users",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const q = String((req.query.q as any) || "").trim();
      const adminRole = String((req.query.admin_role as any) || "").trim(); // super|admin|none|''
      const banned = String((req.query.banned as any) || "").trim(); // banned|not_banned|''
      const verificationStatus = String((req.query.verification_status as any) || "").trim();
      const verificationRequired = String((req.query.verification_required as any) || "").trim(); // required|not_required|''
      const onboarding = String((req.query.onboarding as any) || "").trim(); // complete|incomplete|''
      const accountType = String((req.query.account_type as any) || "").trim();

      const sortRaw = String((req.query.sort as any) || "created_at").trim();
      const dirRaw = String((req.query.dir as any) || "desc").trim().toLowerCase();
      const dir = dirRaw === "asc" ? "ASC" : "DESC";

      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const sortMap: Record<string, string> = {
        created_at: "u.created_at",
        updated_at: "u.updated_at",
        email: "u.email",
        display_name: "COALESCE(p.display_name, u.email)",
        strike_count: "u.strike_count",
        banned_until: "u.banned_until",
        verification_status: "u.verification_status",
        admin_role: "pa.role"
      };

      const sortExpr = sortMap[sortRaw] || "u.created_at";

      const params: any[] = [];
      const conditions: string[] = [];

      if (q) {
        params.push(`%${q}%`);
        conditions.push(`(u.email ILIKE $${params.length} OR COALESCE(p.display_name,'') ILIKE $${params.length})`);
      }

      if (adminRole === "super") conditions.push(`pa.role = 'super'`);
      else if (adminRole === "admin") conditions.push(`pa.role = 'admin'`);
      else if (adminRole === "none") conditions.push(`pa.user_id IS NULL`);

      if (banned === "banned") conditions.push(`(u.banned_until IS NOT NULL AND u.banned_until > NOW())`);
      else if (banned === "not_banned") conditions.push(`(u.banned_until IS NULL OR u.banned_until <= NOW())`);

      if (verificationRequired === "required") conditions.push(`u.verification_required = TRUE`);
      else if (verificationRequired === "not_required") conditions.push(`u.verification_required = FALSE`);

      if (verificationStatus) {
        params.push(verificationStatus);
        conditions.push(`u.verification_status = $${params.length}`);
      }

      if (onboarding === "complete") conditions.push(`u.onboarding_completed = TRUE`);
      else if (onboarding === "incomplete") conditions.push(`u.onboarding_completed = FALSE`);

      if (accountType) {
        params.push(accountType);
        conditions.push(`u.account_type = $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const baseFrom = `
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        LEFT JOIN platform_admins pa ON pa.user_id = u.id AND pa.revoked_at IS NULL
        ${where}
      `;

      const totalRow = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, params);
      const total = (totalRow.rows[0]?.total as number) ?? 0;

      params.push(limit);
      params.push(offset);

      const rows = await pool.query(
        `SELECT
           u.id,
           u.email,
           u.role,
           u.account_type,
           u.requester_mode,
           u.onboarding_completed,
           u.verification_required,
           u.verification_status,
           u.strike_count,
           u.banned_until,
           u.shadow_banned,
           (SELECT background_check_status FROM user_profiles bp WHERE bp.user_id = u.id) AS background_check_status,
           u.banned_reason,
           u.created_at,
           u.updated_at,
           p.display_name,
           p.public_location,
           pa.role AS platform_admin_role
         ${baseFrom}
         ORDER BY ${sortExpr} ${dir}
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({ users: rows.rows, limit, offset, total });
    })
  );


app.post(
    "/v1/admin/users/:id/grant-admin",
    wrap(async (req, res) => {
      const r = await requireSuperAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      const schema = z.object({ role: z.enum(["admin", "super"]).optional(), notes: z.string().max(2000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const role = parsed.data.role || "admin";

      await pool.query(
        `INSERT INTO platform_admins (user_id, role, granted_by_user_id, granted_at, revoked_at, notes)
         VALUES ($1, $2, $3, NOW(), NULL, $4)
         ON CONFLICT (user_id)
         DO UPDATE SET role = EXCLUDED.role, granted_by_user_id = EXCLUDED.granted_by_user_id, granted_at = NOW(), revoked_at = NULL, revoked_by_user_id = NULL, notes = EXCLUDED.notes`,
        [targetUserId, role, String((r.user as any).id), parsed.data.notes ? String(parsed.data.notes) : null]
      );

      return res.json({ ok: true });
    })
  );


  app.post(
    "/v1/admin/users/:id/revoke-admin",
    wrap(async (req, res) => {
      const r = await requireSuperAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      await pool.query(
        `UPDATE platform_admins
            SET revoked_at = NOW(), revoked_by_user_id = $2
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [targetUserId, String((r.user as any).id)]
      );

      return res.json({ ok: true });
    })
  );


  app.post(
    "/v1/admin/users/:id/strike",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      const actingUserId = String((r.user as any).id);
      if (!ensureNotSelf(targetUserId, actingUserId)) return res.status(400).json({ message: "Cannot strike yourself" });
      if (!(await staffTargetAllowed(targetUserId, Boolean(r.flags.isSuperAdmin)))) return res.status(403).json({ message: "Only a super admin can take action on platform staff" });

      const schema = z.object({ reason: z.string().min(1).max(500).optional(), notes: z.string().max(4000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      await pool.query(`UPDATE users SET strike_count = strike_count + 1, updated_at = NOW() WHERE id = $1`, [targetUserId]);
      await writeEnforcement(actingUserId, targetUserId, "strike", parsed.data.reason ? String(parsed.data.reason) : null, parsed.data.notes ? String(parsed.data.notes) : null, null);

      return res.json({ ok: true });
    })
  );


  app.post(
    "/v1/admin/users/:id/clear-strikes",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      const actingUserId = String((r.user as any).id);
      if (!ensureNotSelf(targetUserId, actingUserId)) return res.status(400).json({ message: "Cannot clear your own strikes" });

      const schema = z.object({ notes: z.string().max(4000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      await pool.query(`UPDATE users SET strike_count = 0, updated_at = NOW() WHERE id = $1`, [targetUserId]);
      await writeEnforcement(actingUserId, targetUserId, "clear_strikes", null, parsed.data.notes ? String(parsed.data.notes) : null, null);

      return res.json({ ok: true });
    })
  );


  app.post(
    "/v1/admin/users/:id/ban",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      const actingUserId = String((r.user as any).id);
      if (!ensureNotSelf(targetUserId, actingUserId)) return res.status(400).json({ message: "Cannot ban yourself" });
      if (!(await staffTargetAllowed(targetUserId, Boolean(r.flags.isSuperAdmin)))) return res.status(403).json({ message: "Only a super admin can take action on platform staff" });

      const schema = z.object({
        until: z.string().datetime().optional(),
        reason: z.string().min(1).max(500).optional(),
        notes: z.string().max(4000).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const until = parsed.data.until ? new Date(parsed.data.until) : null;
      if (until && !Number.isFinite(until.getTime())) return res.status(400).json({ message: "Invalid until" });
      if (until && until.getTime() <= Date.now()) return res.status(400).json({ message: "Pick an end date in the future" });

      await pool.query(
        `UPDATE users
            SET banned_until = $2,
                banned_reason = $3,
                banned_at = NOW(),
                banned_by_user_id = $4,
                updated_at = NOW()
          WHERE id = $1`,
        // No end date means until further notice (previously it stored NULL and banned nobody).
        [targetUserId, until ? until.toISOString() : "infinity", parsed.data.reason ? String(parsed.data.reason) : null, actingUserId]
      );
      // A ban takes effect now: every session ends.
      await pool.query("DELETE FROM sessions WHERE user_id::text = $1", [targetUserId]);

      await writeEnforcement(actingUserId, targetUserId, "ban", parsed.data.reason ? String(parsed.data.reason) : null, parsed.data.notes ? String(parsed.data.notes) : null, until);

      return res.json({ ok: true });
    })
  );


  app.post(
    "/v1/admin/users/:id/unban",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      const actingUserId = String((r.user as any).id);
      if (!ensureNotSelf(targetUserId, actingUserId)) return res.status(400).json({ message: "Cannot unban yourself" });

      const schema = z.object({ notes: z.string().max(4000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      await pool.query(
        `UPDATE users
            SET banned_until = NULL,
                banned_reason = NULL,
                banned_at = NULL,
                banned_by_user_id = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [targetUserId]
      );

      await writeEnforcement(actingUserId, targetUserId, "unban", null, parsed.data.notes ? String(parsed.data.notes) : null, null);
      return res.json({ ok: true });
    })
  );


  
  app.post(
    "/v1/admin/users/:id/delete",
    wrap(async (req, res) => {
      const r = await requireSuperAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      const actingUserId = String((r.user as any).id);
      if (!ensureNotSelf(targetUserId, actingUserId)) return res.status(400).json({ message: "Cannot delete yourself" });

      const schema = z.object({ confirm: z.literal("DELETE") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Type DELETE to confirm." });

      const client = await pool.connect();
      const safe = async (sql: string, params: any[]) => {
        try {
          await client.query(sql, params);
        } catch (e: any) {
          // If a table/column is missing (migrations disabled / older schema), ignore and continue.
          if (e && (e.code === "42P01" || e.code === "42703")) return;
          throw e;
        }
      };

      try {
        await client.query("BEGIN");

        // Break any FK links that were created without ON DELETE SET NULL (older schema).
        await safe(`UPDATE users SET verified_by_user_id = NULL WHERE verified_by_user_id = $1`, [targetUserId]);
        await safe(`UPDATE users SET banned_by_user_id = NULL WHERE banned_by_user_id = $1`, [targetUserId]);
        await safe(`UPDATE organizations SET created_by_user_id = NULL WHERE created_by_user_id = $1`, [targetUserId]);
        await safe(`UPDATE organizations SET verified_by_user_id = NULL WHERE verified_by_user_id = $1`, [targetUserId]);
        await safe(`UPDATE request_applications SET assigned_to_user_id = NULL WHERE assigned_to_user_id = $1`, [targetUserId]);
        await safe(`UPDATE request_applications SET status_updated_by_user_id = NULL WHERE status_updated_by_user_id = $1`, [targetUserId]);

        // Remove admin record explicitly (also cascades in newer schemas).
        await safe(`DELETE FROM platform_admins WHERE user_id = $1`, [targetUserId]);

        const del = await client.query(`DELETE FROM users WHERE id = $1`, [targetUserId]);
        if (del.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "User not found" });
        }

        await client.query("COMMIT");
        return res.json({ ok: true });
      } catch (e: any) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        console.error("[Admin] delete user failed", e);
        return res.status(500).json({ message: "Failed to delete user" });
      } finally {
        client.release();
      }
    })
  );
}
