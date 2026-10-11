import { execFileSync } from "child_process";
import path from "path";
import { Client } from "pg";
import { testDatabaseUrl } from "./test-db-url";

/** Creates (if needed), resets, migrates and seeds the test database once per run. */
export default async function setup() {
  const url = testDatabaseUrl();
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(dbName)) throw new Error(`Refusing to reset non-test database "${dbName}"`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const c = new Client({ connectionString: admin.toString() });
  await c.connect();
  const exists = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (!exists.rowCount) await c.query(`CREATE DATABASE "${dbName}"`);
  await c.end();

  const env = { ...process.env, NODE_ENV: "test", DATABASE_URL: url, DATABASE_URL_MIGRATIONS: url, SEED_PASSWORD: "Test-Password-123!" };
  const cwd = path.resolve(__dirname, "..");
  const tsx = path.resolve(cwd, "node_modules/.bin/tsx");
  execFileSync(tsx, ["src/db/migrate-cli.ts", "reset"], { cwd, env, stdio: "pipe" });
  execFileSync(tsx, ["src/db/seed.ts"], { cwd, env, stdio: "pipe" });
}
