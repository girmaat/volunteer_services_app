import "dotenv/config";
import { Pool } from "pg";
import { migrateUp, migrationStatus, resetDatabase } from "./migrator";

async function main() {
  const cmd = process.argv[2] || "up";
  const url = process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (or DATABASE_URL_MIGRATIONS) is required");
  const pool = new Pool({ connectionString: url });
  try {
    if (cmd === "status") {
      for (const m of await migrationStatus(pool)) console.log(`${m.appliedAt ? "applied" : "PENDING"}  ${m.name}`);
      return;
    }
    if (cmd === "reset") {
      await resetDatabase(pool);
      console.log("Database reset");
    }
    const ran = await migrateUp(pool);
    console.log(ran.length ? `Applied ${ran.length} migration(s)` : "Database is up to date");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
