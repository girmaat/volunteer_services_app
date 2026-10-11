import "dotenv/config";
import { Client } from "pg";

/**
 * Creates the database named in DATABASE_URL if it doesn't exist yet,
 * by connecting to the server's default "postgres" database with the same credentials.
 */
async function main() {
  const url = process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error(`Unsupported database name: ${dbName}`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if ((exists.rowCount ?? 0) > 0) {
      console.log(`Database "${dbName}" already exists`);
      return;
    }
    try {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Created database "${dbName}"`);
    } catch (e) {
      const user = decodeURIComponent(target.username);
      console.error(
        `Could not create database "${dbName}" as "${user}": ${(e as Error).message}\n` +
          `Ask a Postgres superuser to run once:\n  CREATE DATABASE ${dbName} OWNER ${user};`
      );
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
