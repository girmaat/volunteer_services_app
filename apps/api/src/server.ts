import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { migrationPool, pool } from "./lib/db";
import { pendingMigrations } from "./db/migrator";
import { createApp } from "./app";
import { startGeoBackfill } from "./lib/geoRuntime";
import { startJobs, stopJobs } from "./jobs/queue";
import { startRealtime, stopRealtime } from "./modules/messaging/realtime";

async function start() {
  const pending = await pendingMigrations(migrationPool);
  if (pending.length > 0) {
    logger.fatal(`${pending.length} pending migration(s): ${pending.join(", ")}. Run \`pnpm db:migrate\` first.`);
    process.exit(1);
  }

  const app = createApp();
  await startJobs();
  await startRealtime();
  startGeoBackfill();

  const server = app.listen(env.PORT, () => logger.info(`ThankYou API listening on http://localhost:${env.PORT}`));
  server.keepAliveTimeout = 65_000; // longer than typical load-balancer idle timeouts

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down");
    server.close(async () => {
      await stopJobs().catch(() => undefined);
      await stopRealtime().catch(() => undefined);
      await pool.end().catch(() => undefined);
      if (migrationPool !== pool) await migrationPool.end().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((e) => {
  logger.fatal({ err: e }, "failed to start");
  process.exit(1);
});
