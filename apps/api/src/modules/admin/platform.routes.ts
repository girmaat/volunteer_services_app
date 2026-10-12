import type { Express } from "express";
import { z } from "zod";
import { requirePlatformAdmin, requireSuperAdmin } from "../../admin/auth";
import { RUNNABLE_JOBS, runJobNow, type RunnableJob } from "../../jobs/queue";
import { migrationPool, pool } from "../../lib/db";
import { pendingMigrations } from "../../db/migrator";
import { wrap } from "../../lib/http";
import { ensurePlatformSettingsRow, nowIso } from "./helpers";

export function registerAdminPlatformRoutes(app: Express) {

  // Run a scheduled job now (reminders, hourly maintenance). Super admins only; audited by the
  // admin audit middleware like every other admin mutation.
  app.post(
    "/v1/admin/jobs/:name/run",
    wrap(async (req, res) => {
      const r = await requireSuperAdmin(pool, req, res);
      if (!r) return;
      const name = String(req.params.name);
      if (!(RUNNABLE_JOBS as readonly string[]).includes(name)) return res.status(404).json({ message: "Unknown job", jobs: RUNNABLE_JOBS });
      const started = Date.now();
      const result = await runJobNow(name as RunnableJob);
      res.locals.audit = { action: "job.run", targetType: "job", targetId: name };
      return res.json({ job: name, result: result ?? null, ms: Date.now() - started });
    })
  );

  // System health (DB status / ownership)
  app.get(
    "/v1/admin/system/db-status",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      // Migrations run with `pnpm db:migrate` (never at startup); report anything still pending.
      const pending = await pendingMigrations(migrationPool).catch(() => [] as string[]);
      const runMigrations = false;
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
        ownerMismatches = mm.rows;
      }

      return res.json({
        run_migrations: runMigrations,
        pending_migrations: pending,
        db_user: (info.rows[0])?.db_user || null,
        session_user: (info.rows[0])?.session_user || null,
        database: (info.rows[0])?.database || null,
        expected_owner: expectedOwner,
        owner_mismatches: ownerMismatches
      });
    })
  );


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
          WHERE id = $1`,
        [1, enabled, message && message.length ? message : null, String(r.user.id)]
      );

      await pool.query(
        `INSERT INTO platform_settings_audit (setting_key, setting_value, changed_by_user_id)
         VALUES ($1, $2::jsonb, $3)`,
        [
          "maintenance",
          JSON.stringify({ enabled, message: message && message.length ? message : null }),
          String(r.user.id)
        ]
      );

      return res.json({ ok: true });
    })
  );
}
