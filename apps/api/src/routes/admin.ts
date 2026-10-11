import type express from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { requirePlatformAdmin, requireSuperAdmin } from "../admin/auth";

type Wrap = (fn: (req: express.Request, res: express.Response) => Promise<any>) => (req: express.Request, res: express.Response) => void;

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseLimit(input: unknown, defaultLimit: number, maxLimit: number) {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return clampInt(Math.floor(n), 1, maxLimit);
}

function parseOffset(input: unknown) {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

let _shareReportsHasModerationCols: boolean | null = null;
let _shareReportsColsCheckedAt = 0;

async function shareReportsHaveModerationCols(pool: Pool): Promise<boolean> {
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



let _shareLinksHasModerationCols: boolean | null = null;
let _shareLinksColsCheckedAt = 0;

async function shareLinksHaveModerationCols(pool: Pool): Promise<boolean> {
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
function nowIso() {
  return new Date().toISOString();
}

export function registerAdminRoutes(app: express.Express, pool: Pool, wrap: Wrap) {
  // Dashboard
  app.get(
    "/v1/admin/dashboard",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const counts = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM users) AS users_total,
           (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days') AS users_new_7d,
           (SELECT COUNT(*)::int FROM organizations) AS orgs_total,
           (SELECT COUNT(*)::int FROM service_requests) AS requests_total,
           (SELECT COUNT(*)::int FROM service_requests WHERE status = 'open') AS requests_open,
           (SELECT COUNT(*)::int FROM user_reports WHERE status IN ('submitted','in_review')) AS reports_open,
           (SELECT COUNT(*)::int FROM user_reports WHERE status = 'submitted') AS reports_submitted,
           (SELECT COUNT(*)::int FROM org_incident_reports WHERE status IN ('open','in_review')) AS incidents_open,
           (SELECT COUNT(*)::int FROM organizations WHERE verification_required = TRUE OR verification_status IN ('required','submitted','rejected')) AS org_verification_queue,
           (SELECT COUNT(*)::int FROM users WHERE verification_required = TRUE OR verification_status IN ('required','submitted','rejected')) AS user_verification_queue,
           (SELECT COUNT(*)::int FROM users WHERE banned_until IS NOT NULL AND banned_until > NOW()) AS banned_users
        `
      );

            // Include share-link reports in report counts even when migrations are disabled.
      const shareHas = await shareReportsHaveModerationCols(pool);
      const shareCounts = await pool.query(
        shareHas
          ? `SELECT
               (SELECT COUNT(*)::int FROM share_reports WHERE status IN ('submitted','in_review')) AS reports_open,
               (SELECT COUNT(*)::int FROM share_reports WHERE status = 'submitted') AS reports_submitted`
          : `SELECT
               (SELECT COUNT(*)::int FROM share_reports) AS reports_open,
               (SELECT COUNT(*)::int FROM share_reports) AS reports_submitted`
      );

      const countsRow: any = counts.rows[0] || {};
      countsRow.reports_open = (countsRow.reports_open || 0) + ((shareCounts.rows[0] as any)?.reports_open || 0);
      countsRow.reports_submitted = (countsRow.reports_submitted || 0) + ((shareCounts.rows[0] as any)?.reports_submitted || 0);

const recent = await pool.query(
        `SELECT id, email, created_at
           FROM users
          ORDER BY created_at DESC
          LIMIT 8`
      );

      const recentReports = await pool.query(
        `
          WITH all_reports AS (
            SELECT
              'user_report'::text AS source,
              r.id,
              r.category,
              r.status,
              r.created_at,
              reporter.email AS reporter_email,
              target.email AS target_email
            FROM user_reports r
            JOIN users reporter ON reporter.id = r.reporter_user_id
            LEFT JOIN users target ON target.id = r.target_user_id

            UNION ALL

            SELECT
              'share_report'::text AS source,
              sr.id,
              sr.reason AS category,
              'submitted'::text AS status,
              sr.created_at,
              COALESCE(reporter.email, '(anonymous)') AS reporter_email,
              owner.email AS target_email
            FROM share_reports sr
            JOIN share_links sl ON sl.id = sr.share_link_id
            LEFT JOIN users reporter ON reporter.id = sr.reporter_user_id
            LEFT JOIN users owner ON owner.id = sl.created_by_user_id
          )
          SELECT source, id, category, status, created_at, reporter_email, target_email
          FROM all_reports
          ORDER BY created_at DESC
          LIMIT 8
        `
      );

      return res.json({
        generated_at: nowIso(),
        counts: countsRow,
        recent_users: recent.rows,
        recent_reports: recentReports.rows
      });
    })
  );

  // System health (DB status / ownership)
  app.get(
    "/v1/admin/system/db-status",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const runMigrations = String(process.env.RUN_MIGRATIONS ?? "true").toLowerCase() !== "false";
      const expectedOwner = String(process.env.DB_SCHEMA_OWNER || "").trim() || null;

      const info = await pool.query(
        `SELECT current_user::text AS db_user, session_user::text AS session_user, current_database()::text AS database`
      );

      let ownerMismatches: Array<{ tablename: string; tableowner: string }> = [];
      if (expectedOwner) {
        const mm = await pool.query(
          `
            SELECT tablename, tableowner
              FROM pg_tables
             WHERE schemaname = 'public'
               AND tableowner <> $1
             ORDER BY tablename ASC
             LIMIT 200
          `,
          [expectedOwner]
        );
        ownerMismatches = mm.rows as any;
      }

      return res.json({
        run_migrations: runMigrations,
        db_user: (info.rows[0] as any)?.db_user || null,
        session_user: (info.rows[0] as any)?.session_user || null,
        database: (info.rows[0] as any)?.database || null,
        expected_owner: expectedOwner,
        owner_mismatches: ownerMismatches
      });
    })
  );


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

  function ensureNotSelf(targetUserId: string, actingUserId: string) {
    return String(targetUserId) !== String(actingUserId);
  }

  async function writeEnforcement(
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

  app.post(
    "/v1/admin/users/:id/strike",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const targetUserId = String(req.params.id || "");
      const actingUserId = String((r.user as any).id);
      if (!ensureNotSelf(targetUserId, actingUserId)) return res.status(400).json({ message: "Cannot strike yourself" });

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

      const schema = z.object({
        until: z.string().datetime().optional(),
        reason: z.string().min(1).max(500).optional(),
        notes: z.string().max(4000).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const until = parsed.data.until ? new Date(parsed.data.until) : null;
      if (until && !Number.isFinite(until.getTime())) return res.status(400).json({ message: "Invalid until" });

      await pool.query(
        `UPDATE users
            SET banned_until = $2,
                banned_reason = $3,
                banned_at = NOW(),
                banned_by_user_id = $4,
                updated_at = NOW()
          WHERE id = $1`,
        [targetUserId, until ? until.toISOString() : null, parsed.data.reason ? String(parsed.data.reason) : null, actingUserId]
      );

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

app.get(
    "/v1/admin/enforcement/actions",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const target = String((req.query.target_user_id as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);

      const params: any[] = [];
      let where = "";
      if (target) {
        params.push(target);
        where = `WHERE a.target_user_id = $${params.length}`;
      }
      params.push(limit);

      let rows;

      try {
        rows = await pool.query(
        `SELECT a.id, a.target_user_id, a.action_type, a.ban_until, a.reason, a.notes, a.created_at,
                actor.email AS actor_email,
                target.email AS target_email
           FROM user_enforcement_actions a
           LEFT JOIN users actor ON actor.id = a.created_by_user_id
           JOIN users target ON target.id = a.target_user_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT $${params.length}`,
        params
      );
      } catch (e: any) {
        if (e && (e.code === "42P01" || e.code === "42703")) {
          return res.json({ actions: [] });
        }
        throw e;
      }


      return res.json({ actions: rows.rows });
    })
  );

  app.get(
    "/v1/admin/enforcement/banned",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const limit = parseLimit(req.query.limit, 50, 200);

      let rows;

      try {
        rows = await pool.query(
        `SELECT u.id, u.email, u.banned_until, u.banned_reason, u.strike_count, p.display_name
           FROM users u
           LEFT JOIN user_profiles p ON p.user_id = u.id
          WHERE u.banned_until IS NOT NULL AND u.banned_until > NOW()
          ORDER BY u.banned_until DESC
          LIMIT $1`,
        [limit]
      );
      } catch (e: any) {
        if (e && (e.code === "42P01" || e.code === "42703")) {
          return res.json({ banned_users: [] });
        }
        throw e;
      }


      return res.json({ banned_users: rows.rows });
    })
  );

  // Organization management
  app.get(
    "/v1/admin/organizations",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const q = String((req.query.q as any) || "").trim();
      const status = String((req.query.status as any) || "").trim();
      const requiredRaw = String((req.query.required as any) || "").trim();
      const sortRaw = String((req.query.sort as any) || "").trim();
      const dirRaw = String((req.query.dir as any) || "").trim().toLowerCase();

      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      const wheres: string[] = [];

      if (q) {
        params.push(`%${q}%`);
        wheres.push(
          `(o.slug ILIKE $${params.length} OR o.name ILIKE $${params.length} OR COALESCE(o.contact_email,'') ILIKE $${params.length})`
        );
      }

      if (status && status !== "all") {
        if (status === "needs_review") {
          wheres.push(`o.verification_status IN ('required','submitted')`);
        } else {
          params.push(status);
          wheres.push(`o.verification_status = $${params.length}`);
        }
      }

      if (requiredRaw === "0" || requiredRaw === "1") {
        params.push(requiredRaw === "1");
        wheres.push(`o.verification_required = $${params.length}`);
      }

      const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

      const sortMap: Record<string, string> = {
        updated_at: "o.updated_at",
        name: "o.name",
        members_count: "members_count",
        verification_status: "o.verification_status",
        verification_submitted_at: "o.verification_submitted_at"
      };

      const sortKey = sortMap[sortRaw] || sortMap.updated_at;
      const dir = dirRaw === "asc" ? "ASC" : "DESC";

      params.push(limit);
      params.push(offset);

      const rows = await pool.query(
        `SELECT
           o.slug,
           o.name,
           o.summary,
           o.location,
           o.mission,
           o.website_url,
           o.contact_email,
           o.logo_url,
           o.verification_required,
           o.verification_status,
           o.verification_submitted_at,
           o.verified_at,
           o.created_at,
           o.updated_at,
           (SELECT COUNT(*)::int FROM organization_members m WHERE m.org_slug = o.slug AND m.status = 'active') AS members_count
         FROM organizations o
         ${where}
         ORDER BY ${sortKey} ${dir}, o.slug ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({
        organizations: rows.rows,
        limit,
        offset,
        q,
        status: status || "all",
        required: requiredRaw,
        sort: sortRaw || "updated_at",
        dir: dirRaw === "asc" ? "asc" : "desc"
      });
    })
  );

  app.patch(
    "/v1/admin/organizations/:slug",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const slug = String(req.params.slug || "").trim();
      if (!slug) return res.status(400).json({ message: "Invalid org slug" });

      const schema = z
        .object({
          name: z.string().min(1).max(200).optional(),
          summary: z.string().min(1).max(2000).optional(),
          location: z.string().min(1).max(200).optional(),
          mission: z.string().max(4000).optional().nullable(),
          website_url: z.string().max(500).optional().nullable(),
          contact_email: z.string().email().optional().nullable(),
          logo_url: z.string().max(500).optional().nullable(),
          verification_required: z.boolean().optional(),
          verification_status: z.enum(["not_required", "required", "submitted", "approved", "rejected"]).optional()
        })
        .strict();

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const fields = parsed.data as any;
      const keys = Object.keys(fields);
      if (keys.length === 0) return res.status(400).json({ message: "No changes" });

      const sets: string[] = [];
      const params: any[] = [slug];

      for (const k of keys) {
        params.push(fields[k]);
        sets.push(`${k} = $${params.length}`);
      }
      sets.push(`updated_at = NOW()`);

      const qy = `UPDATE organizations SET ${sets.join(", ")} WHERE slug = $1 RETURNING slug`;
      const upd = await pool.query(qy, params);
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Organization not found" });
      return res.json({ ok: true });
    })
  );

  // Opportunity management (service_requests only)
  app.get(
    "/v1/admin/requests",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const q = String((req.query.q as any) || "").trim();
      const status = String((req.query.status as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      const clauses: string[] = [];

      if (q) {
        params.push(`%${q}%`);
        clauses.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
      }
      if (status && ["open", "paused", "closed"].includes(status)) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      params.push(limit);
      params.push(offset);

      const rows = await pool.query(
        `SELECT
           r.id,
           r.title,
           r.status,
           r.mode,
           r.location_text,
           r.needed_by,
           r.tags,
           r.created_at,
           r.updated_at,
           u.email AS requester_email,
           r.requester_org_slug
         FROM service_requests r
         LEFT JOIN users u ON u.id = r.requester_user_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({ requests: rows.rows, limit, offset });
    })
  );

  app.patch(
    "/v1/admin/requests/:id",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const requestId = String(req.params.id || "").trim();
      const schema = z
        .object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().min(1).max(8000).optional(),
          status: z.enum(["open", "paused", "closed"]).optional(),
          mode: z.enum(["in-person", "remote", "hybrid"]).optional().nullable(),
          location_text: z.string().max(500).optional().nullable(),
          needed_by: z.string().datetime().optional().nullable(),
          tags: z.array(z.string().min(1).max(40)).optional()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const fields = parsed.data as any;
      const keys = Object.keys(fields);
      if (keys.length === 0) return res.status(400).json({ message: "No changes" });

      const sets: string[] = [];
      const params: any[] = [requestId];
      for (const k of keys) {
        let val = fields[k];
        if (k === "needed_by" && typeof val === "string") {
          val = new Date(val).toISOString();
        }
        params.push(val);
        sets.push(`${k} = $${params.length}`);
      }
      sets.push(`updated_at = NOW()`);
      const upd = await pool.query(`UPDATE service_requests SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Service request not found" });
      return res.json({ ok: true });
    })
  );

  // Reports queue
  app.get(
    "/v1/admin/reports",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const status = String((req.query.status as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      let where = "";
      if (status && ["submitted", "in_review", "resolved", "dismissed"].includes(status)) {
        params.push(status);
        where = `WHERE status = $${params.length}`;
      }
      params.push(limit);
      params.push(offset);

            const shareHas = await shareReportsHaveModerationCols(pool);
      const shareLinksHas = await shareLinksHaveModerationCols(pool);

      const shareStatusSql = shareHas ? "srp.status" : "'submitted'::text";
      const shareAdminNotesSql = shareHas ? "srp.admin_notes" : "NULL::text";
      const shareUpdatedAtSql = shareHas ? "srp.updated_at" : "srp.created_at";
      const shareResolvedAtSql = shareHas ? "srp.resolved_at" : "NULL::timestamptz";

      const shareModerationStateSql = shareLinksHas ? "sl.moderation_state" : "NULL::text";
      const shareRevokedReasonSql = shareLinksHas ? "sl.revoked_reason" : "NULL::text";
      const distinctExpr24h = shareHas
        ? "COUNT(DISTINCT COALESCE(r2.reporter_user_id::text, r2.reporter_ip_hash))"
        : "COUNT(DISTINCT r2.reporter_user_id)";

      const rows = await pool.query(
        `
          WITH all_reports AS (
            SELECT
              'user_report'::text AS source,
              r.id,
              r.category,
              COALESCE(r.details, '') AS details,
              r.status,
              r.admin_notes,
              r.created_at,
              r.updated_at,
              r.resolved_at,
              reporter.email AS reporter_email,
              r.target_user_id,
              target.email AS target_email,
              r.target_request_id,
              sr.title AS target_request_title,
              NULL::text AS share_token,
              NULL::text AS share_destination_path,
              NULL::text AS share_type,
              NULL::timestamptz AS share_revoked_at,
              NULL::text AS share_moderation_state,
              NULL::text AS share_revoked_reason,
              NULL::int AS share_report_count,
              NULL::int AS share_distinct_24h
            FROM user_reports r
            JOIN users reporter ON reporter.id = r.reporter_user_id
            LEFT JOIN users target ON target.id = r.target_user_id
            LEFT JOIN service_requests sr ON sr.id = r.target_request_id

            UNION ALL

            SELECT
              'share_report'::text AS source,
              srp.id,
              srp.reason AS category,
              COALESCE(srp.details, '') AS details,
              ${shareStatusSql} AS status,
              ${shareAdminNotesSql} AS admin_notes,
              srp.created_at,
              ${shareUpdatedAtSql} AS updated_at,
              ${shareResolvedAtSql} AS resolved_at,
              COALESCE(reporter.email, '(anonymous)') AS reporter_email,
              sl.created_by_user_id AS target_user_id,
              owner.email AS target_email,
              CASE WHEN sl.share_type = 'SERVICE_REQUEST' THEN sl.target_ref::uuid ELSE NULL END AS target_request_id,
              CASE
                WHEN sl.share_type = 'SERVICE_REQUEST' THEN req.title
                WHEN sl.share_type = 'OPPORTUNITY' THEN CONCAT('Opportunity: ', opp.title)
                ELSE CONCAT('Share link: ', sl.share_type)
              END AS target_request_title,
              sl.token AS share_token,
              sl.destination_path AS share_destination_path,
              sl.share_type,
              sl.revoked_at AS share_revoked_at,
              ${shareModerationStateSql} AS share_moderation_state,
              ${shareRevokedReasonSql} AS share_revoked_reason,
              (SELECT COUNT(*)::int FROM share_reports r2 WHERE r2.share_link_id = sl.id) AS share_report_count,
              (
                SELECT (${distinctExpr24h})::int
                  FROM share_reports r2
                 WHERE r2.share_link_id = sl.id
                   AND r2.created_at >= NOW() - INTERVAL '24 hours'
              ) AS share_distinct_24h
            FROM share_reports srp
            JOIN share_links sl ON sl.id = srp.share_link_id
            LEFT JOIN users reporter ON reporter.id = srp.reporter_user_id
            LEFT JOIN users owner ON owner.id = sl.created_by_user_id
            LEFT JOIN service_requests req ON req.id = CASE WHEN sl.share_type = 'SERVICE_REQUEST' THEN sl.target_ref::uuid ELSE NULL END
            LEFT JOIN opportunities opp ON opp.id = CASE WHEN sl.share_type = 'OPPORTUNITY' AND sl.target_ref ~ '^[0-9]+$' THEN sl.target_ref::int ELSE NULL END
          )
          SELECT
            source,
            id,
            category,
            details,
            status,
            admin_notes,
            created_at,
            updated_at,
            resolved_at,
            reporter_email,
            target_user_id,
            target_email,
            target_request_id,
            target_request_title,
            share_token,
            share_destination_path,
            share_type,
            share_revoked_at,
            share_moderation_state,
            share_revoked_reason,
            share_report_count,
            share_distinct_24h
          FROM all_reports
          ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
        `,
        params
      );

return res.json({ reports: rows.rows, limit, offset });
    })
  );



  // Report details (used by Admin dashboard "Details" buttons)
  app.get(
    "/v1/admin/reports/:id",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const reportId = String(req.params.id || "").trim();
      if (!reportId) return res.status(400).json({ message: "Invalid report id" });

      const shareHas = await shareReportsHaveModerationCols(pool);
      const shareLinksHas = await shareLinksHaveModerationCols(pool);

      const shareStatusSql = shareHas ? "srp.status" : "'submitted'::text";
      const shareAdminNotesSql = shareHas ? "srp.admin_notes" : "NULL::text";
      const shareUpdatedAtSql = shareHas ? "srp.updated_at" : "srp.created_at";
      const shareResolvedAtSql = shareHas ? "srp.resolved_at" : "NULL::timestamptz";

      const shareModerationStateSql = shareLinksHas ? "sl.moderation_state" : "NULL::text";
      const shareRevokedReasonSql = shareLinksHas ? "sl.revoked_reason" : "NULL::text";
      const distinctExpr24h = shareHas
        ? "COUNT(DISTINCT COALESCE(r2.reporter_user_id::text, r2.reporter_ip_hash))"
        : "COUNT(DISTINCT r2.reporter_user_id)";

      const rows = await pool.query(
        `
          WITH all_reports AS (
            SELECT
              'user_report'::text AS source,
              r.id,
              r.category,
              COALESCE(r.details, '') AS details,
              r.status,
              r.admin_notes,
              r.created_at,
              r.updated_at,
              r.resolved_at,
              reporter.email AS reporter_email,
              r.target_user_id,
              target.email AS target_email,
              r.target_request_id,
              sr.title AS target_request_title,
              NULL::text AS share_token,
              NULL::text AS share_destination_path,
              NULL::text AS share_type,
              NULL::timestamptz AS share_revoked_at,
              NULL::text AS share_moderation_state,
              NULL::text AS share_revoked_reason,
              NULL::int AS share_report_count,
              NULL::int AS share_distinct_24h
            FROM user_reports r
            JOIN users reporter ON reporter.id = r.reporter_user_id
            LEFT JOIN users target ON target.id = r.target_user_id
            LEFT JOIN service_requests sr ON sr.id = r.target_request_id

            UNION ALL

            SELECT
              'share_report'::text AS source,
              srp.id,
              srp.reason AS category,
              COALESCE(srp.details, '') AS details,
              ${shareStatusSql} AS status,
              ${shareAdminNotesSql} AS admin_notes,
              srp.created_at,
              ${shareUpdatedAtSql} AS updated_at,
              ${shareResolvedAtSql} AS resolved_at,
              COALESCE(reporter.email, '(anonymous)') AS reporter_email,
              sl.created_by_user_id AS target_user_id,
              owner.email AS target_email,
              CASE WHEN sl.share_type = 'SERVICE_REQUEST' THEN sl.target_ref::uuid ELSE NULL END AS target_request_id,
              CASE
                WHEN sl.share_type = 'SERVICE_REQUEST' THEN req.title
                WHEN sl.share_type = 'OPPORTUNITY' THEN CONCAT('Opportunity: ', opp.title)
                ELSE CONCAT('Share link: ', sl.share_type)
              END AS target_request_title,
              sl.token AS share_token,
              sl.destination_path AS share_destination_path,
              sl.share_type,
              sl.revoked_at AS share_revoked_at,
              ${shareModerationStateSql} AS share_moderation_state,
              ${shareRevokedReasonSql} AS share_revoked_reason,
              (SELECT COUNT(*)::int FROM share_reports r2 WHERE r2.share_link_id = sl.id) AS share_report_count,
              (
                SELECT (${distinctExpr24h})::int
                  FROM share_reports r2
                 WHERE r2.share_link_id = sl.id
                   AND r2.created_at >= NOW() - INTERVAL '24 hours'
              ) AS share_distinct_24h
            FROM share_reports srp
            JOIN share_links sl ON sl.id = srp.share_link_id
            LEFT JOIN users reporter ON reporter.id = srp.reporter_user_id
            LEFT JOIN users owner ON owner.id = sl.created_by_user_id
            LEFT JOIN service_requests req ON req.id = CASE WHEN sl.share_type = 'SERVICE_REQUEST' THEN sl.target_ref::uuid ELSE NULL END
            LEFT JOIN opportunities opp ON opp.id = CASE WHEN sl.share_type = 'OPPORTUNITY' AND sl.target_ref ~ '^[0-9]+$' THEN sl.target_ref::int ELSE NULL END
          )
          SELECT
            source,
            id,
            category,
            details,
            status,
            admin_notes,
            created_at,
            updated_at,
            resolved_at,
            reporter_email,
            target_user_id,
            target_email,
            target_request_id,
            target_request_title,
            share_token,
            share_destination_path,
            share_type,
            share_revoked_at,
            share_moderation_state,
            share_revoked_reason,
            share_report_count,
            share_distinct_24h
          FROM all_reports
          WHERE id = $1
          LIMIT 1
        `,
        [reportId]
      );

      if ((rows.rowCount ?? 0) == 0) return res.status(404).json({ message: "Report not found" });
      return res.json({
        report: rows.rows[0],
        capabilities: {
          share_reports_moderation_cols: shareHas,
          share_links_moderation_cols: shareLinksHas
        }
      });
    })
  );
  app.post(
    "/v1/admin/reports/:id/update",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const reportId = String(req.params.id || "");
      const schema = z
        .object({
          status: z.enum(["submitted", "in_review", "resolved", "dismissed"]).optional(),
          admin_notes: z.string().max(4000).optional().nullable()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const status = parsed.data.status;
      const adminNotes = parsed.data.admin_notes !== undefined ? parsed.data.admin_notes : undefined;

      const sets: string[] = [];
      const params: any[] = [reportId];
      if (status) {
        params.push(status);
        sets.push(`status = $${params.length}`);
        if (status === "resolved") sets.push(`resolved_at = NOW()`);
        if (status !== "resolved") sets.push(`resolved_at = NULL`);
      }
      if (adminNotes !== undefined) {
        params.push(adminNotes);
        sets.push(`admin_notes = $${params.length}`);
      }
      if (sets.length === 0) return res.status(400).json({ message: "No changes" });
      sets.push(`updated_at = NOW()`);

      const upd = await pool.query(`UPDATE user_reports SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
      if ((upd.rowCount ?? 0) === 0) {
        const shareHas = await shareReportsHaveModerationCols(pool);
        if (!shareHas) {
          return res.status(400).json({ message: "Share-link reports are visible, but can’t be updated because DB migrations are disabled (share_reports lacks moderation columns). Enable RUN_MIGRATIONS or run the migrations as the DB owner." });
        }
        const upd2 = await pool.query(`UPDATE share_reports SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
        if ((upd2.rowCount ?? 0) === 0) return res.status(404).json({ message: "Report not found" });
      }
      return res.json({ ok: true });
    })
  );

  
  // Share-link report workflow actions (warn / block / unblock / clear)
  app.post(
    "/v1/admin/share-reports/:id/action",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const reportId = String(req.params.id || "");
      const schema = z
        .object({
          action: z.enum(["warn", "block", "unblock", "clear"]),
          admin_notes: z.string().max(4000).optional().nullable()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const shareHas = await shareReportsHaveModerationCols(pool);
      const linksHas = await shareLinksHaveModerationCols(pool);

      const reportRes = await pool.query(
        `
          SELECT srp.id, srp.share_link_id, sl.token
            FROM share_reports srp
            JOIN share_links sl ON sl.id = srp.share_link_id
           WHERE srp.id = $1
           LIMIT 1
        `,
        [reportId]
      );
      if (reportRes.rowCount === 0) return res.status(404).json({ message: "Report not found" });

      const linkId = (reportRes.rows[0] as any).share_link_id;
      const token = String((reportRes.rows[0] as any).token || "");

      const action = parsed.data.action;
      const adminNotes = parsed.data.admin_notes !== undefined ? parsed.data.admin_notes : undefined;

      if ((action === "warn" || action === "clear") && !linksHas) {
        return res.status(400).json({
          message:
            "Share-link warning state requires newer sharing schema. Run backend/scripts/db/apply_sharing_schema.* as the DB owner, or enable RUN_MIGRATIONS."
        });
      }

      if (action === "block") {
        if (linksHas) {
          await pool.query(
            `
              UPDATE share_links
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revoked_reason = 'admin_block',
                     revoked_by_user_id = $2,
                     moderation_state = 'blocked',
                     moderation_updated_at = NOW(),
                     moderation_updated_by_user_id = $2,
                     moderation_notes = COALESCE($3, moderation_notes)
               WHERE id = $1
            `,
            [linkId, (r.user as any).id, adminNotes ?? null]
          );
        } else {
          await pool.query(`UPDATE share_links SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1`, [linkId]);
        }
      }

      if (action === "unblock") {
        if (linksHas) {
          // If there are still reports, keep the warning state; otherwise clear.
          const rc = await pool.query(`SELECT COUNT(*)::int AS n FROM share_reports WHERE share_link_id = $1`, [linkId]);
          const n = Number((rc.rows[0] as any)?.n || 0);
          const nextState = n > 0 ? "reported" : "clean";

          await pool.query(
            `
              UPDATE share_links
                 SET revoked_at = NULL,
                     revoked_reason = NULL,
                     revoked_by_user_id = NULL,
                     moderation_state = $3,
                     moderation_updated_at = NOW(),
                     moderation_updated_by_user_id = $2,
                     moderation_notes = COALESCE($4, moderation_notes)
               WHERE id = $1
            `,
            [linkId, (r.user as any).id, nextState, adminNotes ?? null]
          );
        } else {
          await pool.query(`UPDATE share_links SET revoked_at = NULL WHERE id = $1`, [linkId]);
        }
      }

      if (action === "warn") {
        await pool.query(
          `
            UPDATE share_links
               SET moderation_state = 'reported',
                   moderation_updated_at = NOW(),
                   moderation_updated_by_user_id = $2,
                   moderation_notes = COALESCE($3, moderation_notes)
             WHERE id = $1
          `,
          [linkId, (r.user as any).id, adminNotes ?? null]
        );
      }

      if (action === "clear") {
        await pool.query(
          `
            UPDATE share_links
               SET moderation_state = 'clean',
                   moderation_updated_at = NOW(),
                   moderation_updated_by_user_id = $2,
                   moderation_notes = COALESCE($3, moderation_notes)
             WHERE id = $1
          `,
          [linkId, (r.user as any).id, adminNotes ?? null]
        );
      }

      if (shareHas) {
        const sets: string[] = ["status = 'resolved'", "updated_at = NOW()", "resolved_at = NOW()", "action = $2", "action_at = NOW()", "action_by_user_id = $3"];
        const params: any[] = [reportId, action === "clear" ? "clear" : action, (r.user as any).id];

        if (adminNotes !== undefined) {
          params.push(adminNotes ?? null);
          sets.push(`admin_notes = $${params.length}`);
        }

        await pool.query(`UPDATE share_reports SET ${sets.join(", ")} WHERE id = $1`, params);
      }

      return res.json({ ok: true, token });
    })
  );

// Incident review (org_incident_reports)
  app.get(
    "/v1/admin/incidents",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const status = String((req.query.status as any) || "").trim();
      const severity = String((req.query.severity as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      const clauses: string[] = [];
      if (status && ["open", "in_review", "resolved", "closed"].includes(status)) {
        params.push(status);
        clauses.push(`i.status = $${params.length}`);
      }
      if (severity && ["low", "medium", "high", "critical"].includes(severity)) {
        params.push(severity);
        clauses.push(`i.severity = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      params.push(limit);
      params.push(offset);

      const rows = await pool.query(
        `SELECT
           i.id,
           i.org_slug,
           o.name AS org_name,
           i.title,
           i.description,
           i.severity,
           i.status,
           i.internal_notes,
           i.outcome,
           i.created_at,
           i.updated_at,
           sr.id AS request_id,
           sr.title AS request_title,
           u.email AS volunteer_email
         FROM org_incident_reports i
         LEFT JOIN organizations o ON o.slug = i.org_slug
         LEFT JOIN service_requests sr ON sr.id = i.request_id
         LEFT JOIN users u ON u.id = i.volunteer_user_id
         ${where}
         ORDER BY i.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({ incidents: rows.rows, limit, offset });
    })
  );

  app.post(
    "/v1/admin/incidents/:id/update",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const incidentId = String(req.params.id || "");
      const schema = z
        .object({
          status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
          internal_notes: z.string().max(8000).optional().nullable(),
          outcome: z.string().max(4000).optional().nullable()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const sets: string[] = [];
      const params: any[] = [incidentId];
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${k} = $${params.length}`);
      }
      if (sets.length === 0) return res.status(400).json({ message: "No changes" });
      sets.push(`updated_at = NOW()`);

      const upd = await pool.query(`UPDATE org_incident_reports SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Incident not found" });
      return res.json({ ok: true });
    })
  );

  // User verification review
  app.get(
    "/v1/admin/user-verification/queue",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const limit = parseLimit(req.query.limit, 50, 200);

      const rows = await pool.query(
        `SELECT
           u.id,
           u.email,
           u.verification_required,
           u.verification_status,
           u.verification_submitted_at,
           u.verified_at,
           u.verification_notes,
           p.display_name,
           (SELECT COUNT(*)::int FROM verification_documents d WHERE d.user_id = u.id) AS docs_count,
           (SELECT MAX(uploaded_at) FROM verification_documents d WHERE d.user_id = u.id) AS last_uploaded_at,
           u.updated_at
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.verification_required = TRUE
            OR u.verification_status IN ('required','submitted','rejected')
         ORDER BY COALESCE(u.verification_submitted_at, u.updated_at) DESC
         LIMIT $1`,
        [limit]
      );

      return res.json({ users: rows.rows });
    })
  );

  app.get(
    "/v1/admin/user-verification/:userId/documents",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const userId = String(req.params.userId || "");
      const rows = await pool.query(
        `SELECT id, file_name, mime_type, uploaded_at
           FROM verification_documents
          WHERE user_id = $1
          ORDER BY uploaded_at DESC`,
        [userId]
      );

      return res.json({ documents: rows.rows });
    })
  );

  app.get(
    "/v1/admin/user-verification/documents/:docId/download",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const docId = String(req.params.docId || "");
      const rows = await pool.query(`SELECT id, file_name, mime_type, bytes FROM verification_documents WHERE id = $1`, [docId]);
      if ((rows.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not found" });

      const d = rows.rows[0] as any;
      res.setHeader("content-type", d.mime_type || "application/octet-stream");
      res.setHeader("content-disposition", `attachment; filename="${String(d.file_name || "document").replace(/"/g, "")}"`);
      return res.send(d.bytes);
    })
  );

  app.post(
    "/v1/admin/user-verification/:userId/approve",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const userId = String(req.params.userId || "");
      const schema = z.object({ notes: z.string().max(4000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const upd = await pool.query(
        `UPDATE users
            SET verification_required = FALSE,
                verification_status = 'approved',
                verified_at = NOW(),
                verified_by_user_id = $2,
                verification_notes = $3,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id`,
        [userId, String((r.user as any).id), parsed.data.notes ? String(parsed.data.notes) : null]
      );
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "User not found" });
      return res.json({ ok: true });
    })
  );

  app.post(
    "/v1/admin/user-verification/:userId/reject",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const userId = String(req.params.userId || "");
      const schema = z.object({ notes: z.string().max(4000).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const upd = await pool.query(
        `UPDATE users
            SET verification_required = TRUE,
                verification_status = 'rejected',
                verification_notes = $2,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id`,
        [userId, parsed.data.notes ? String(parsed.data.notes) : null]
      );
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "User not found" });
      return res.json({ ok: true });
    })
  );

  async function ensurePlatformSettingsRow() {
    await pool.query(
      `INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
       VALUES (1, FALSE, NULL, NOW())
       ON CONFLICT (id) DO NOTHING`
    );
  }

  // Public: platform status (for Maintenance Mode checks)
  app.get(
    "/v1/platform/status",
    wrap(async (_req, res) => {
      await ensurePlatformSettingsRow();
      const rows = await pool.query(
        `SELECT maintenance_enabled, maintenance_message, updated_at
           FROM platform_settings
          WHERE id = 1`
      );
      const s = rows.rows[0] || { maintenance_enabled: false, maintenance_message: null, updated_at: nowIso() };
      return res.json({
        maintenance: {
          enabled: Boolean(s.maintenance_enabled),
          message: s.maintenance_message ? String(s.maintenance_message) : null,
          updated_at: s.updated_at ? new Date(s.updated_at).toISOString() : nowIso()
        }
      });
    })
  );

  // Admin: read platform settings
  app.get(
    "/v1/admin/platform/settings",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      await ensurePlatformSettingsRow();
      const rows = await pool.query(
        `SELECT maintenance_enabled, maintenance_message, updated_by_user_id, updated_at
           FROM platform_settings
          WHERE id = 1`
      );
      const s = rows.rows[0] || {};
      return res.json({
        maintenance: {
          enabled: Boolean(s.maintenance_enabled),
          message: s.maintenance_message ? String(s.maintenance_message) : null,
          updated_by_user_id: s.updated_by_user_id ? String(s.updated_by_user_id) : null,
          updated_at: s.updated_at ? new Date(s.updated_at).toISOString() : nowIso()
        }
      });
    })
  );

  // Admin: toggle Maintenance Mode (and optional banner text)
  app.post(
    "/v1/admin/platform/settings/maintenance",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      await ensurePlatformSettingsRow();

      const schema = z.object({
        enabled: z.boolean(),
        message: z.string().max(4000).optional().nullable()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const enabled = Boolean(parsed.data.enabled);
      const message = parsed.data.message != null ? String(parsed.data.message).trim() : null;

      await pool.query(
        `UPDATE platform_settings
            SET maintenance_enabled = $2,
                maintenance_message = $3,
                updated_by_user_id = $4,
                updated_at = NOW()
          WHERE id = 1`,
        [1, enabled, message && message.length ? message : null, String((r.user as any).id)]
      );

      await pool.query(
        `INSERT INTO platform_settings_audit (setting_key, setting_value, changed_by_user_id)
         VALUES ($1, $2::jsonb, $3)`,
        [
          "maintenance",
          JSON.stringify({ enabled, message: message && message.length ? message : null }),
          String((r.user as any).id)
        ]
      );

      return res.json({ ok: true });
    })
  );

}