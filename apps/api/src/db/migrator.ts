import fs from "fs";
import path from "path";
import type { Pool, PoolClient } from "pg";

/**
 * Minimal, dependency-free SQL migration runner.
 *
 * - Migrations are plain SQL files in apps/api/migrations named NNNN_description.sql.
 * - Each file runs once, inside its own transaction, and is recorded in schema_migrations.
 * - A Postgres advisory lock prevents two processes migrating at the same time.
 * - Databases created by the legacy ensureDbSchema() (tables exist but no schema_migrations)
 *   are adopted: 0001_baseline is marked applied without running it.
 */

// src/db (tsx) → ../../migrations; dist/ (bundled) → ../migrations; override with MIGRATIONS_DIR.
export const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ||
  [path.resolve(__dirname, "../../migrations"), path.resolve(__dirname, "../migrations")].find((d) => fs.existsSync(d)) ||
  path.resolve(__dirname, "../../migrations");
const LOCK_KEY = 726_100_001; // arbitrary constant for pg_advisory_lock

export type MigrationFile = { id: string; name: string; file: string };
export type MigrationStatus = MigrationFile & { appliedAt: string | null };

export function listMigrationFiles(dir = MIGRATIONS_DIR): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((f) => ({ id: f.slice(0, 4), name: f.replace(/\.sql$/, ""), file: path.join(dir, f) }));
}

async function ensureTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

async function adoptLegacyDatabase(client: PoolClient) {
  const applied = await client.query("SELECT 1 FROM schema_migrations LIMIT 1");
  if ((applied.rowCount ?? 0) > 0) return false;
  const legacy = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS has_users");
  if (!legacy.rows[0]?.has_users) return false;
  await client.query("INSERT INTO schema_migrations (id, name) VALUES ('0001', '0001_baseline') ON CONFLICT DO NOTHING");
  return true;
}

export async function migrationStatus(pool: Pool): Promise<MigrationStatus[]> {
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const rows = await client.query<{ id: string; applied_at: string }>("SELECT id, applied_at FROM schema_migrations");
    const applied = new Map(rows.rows.map((r) => [r.id, r.applied_at]));
    return listMigrationFiles().map((m) => ({ ...m, appliedAt: applied.get(m.id) ?? null }));
  } finally {
    client.release();
  }
}

export async function migrateUp(pool: Pool, log: (msg: string) => void = console.log): Promise<string[]> {
  const client = await pool.connect();
  const ran: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    await ensureTable(client);
    if (await adoptLegacyDatabase(client)) log("Adopted existing legacy schema as 0001_baseline");

    const done = new Set((await client.query<{ id: string }>("SELECT id FROM schema_migrations")).rows.map((r) => r.id));
    for (const m of listMigrationFiles()) {
      if (done.has(m.id)) continue;
      const sql = fs.readFileSync(m.file, "utf8");
      log(`Applying ${m.name} ...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("SET search_path TO public");
        await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [m.id, m.name]);
        await client.query("COMMIT");
        ran.push(m.name);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw new Error(`Migration ${m.name} failed: ${(e as Error).message}`);
      }
    }
    return ran;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

/** Drops everything in the public schema. Refuses to run in production. */
export async function resetDatabase(pool: Pool) {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

export async function pendingMigrations(pool: Pool): Promise<string[]> {
  return (await migrationStatus(pool)).filter((m) => !m.appliedAt).map((m) => m.name);
}
