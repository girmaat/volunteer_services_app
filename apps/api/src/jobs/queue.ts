import PgBoss from "pg-boss";
import { env, isTest } from "../lib/env";
import { logger } from "../lib/logger";
import { pool } from "../lib/db";
import { ensureServiceRequestGeo, ensureUserGeo, backfillRecentServiceRequestGeo } from "../geo";
import * as events from "../modules/notifications/events";

/**
 * Background jobs on Postgres (pg-boss): no extra infrastructure. Jobs are retried with backoff.
 * When JOBS_DISABLED=true (tests) handlers run inline instead of being queued.
 */

type JobMap = {
  "geocode.request": { requestId: string; locationText: string };
  "geocode.user": { userId: string };
  "geocode.backfill": Record<string, never>;
  "notify.application_received": { applicationId: string };
  "notify.application_status": { applicationId: string; status: string; promoted?: boolean };
  "notify.request_canceled": { requestId: string; reason: string | null; byAdmin?: boolean };
  "notify.request_needs_review": { requestId: string };
  "notify.request_reviewed": { requestId: string; approved: boolean; reason: string | null };
  "notify.request_filled": { requestId: string };
  "notify.review_requested": { applicationId: string };
  "notify.message_received": { messageId: string };
  "reminders.attendance": Record<string, never>;
  "maintenance.hourly": Record<string, never>;
  "badges.award": { userId: string };
};
export type JobName = keyof JobMap;

const handlers: { [K in JobName]: (data: JobMap[K]) => Promise<unknown> } = {
  "geocode.request": ({ requestId, locationText }) => ensureServiceRequestGeo(pool, requestId, locationText),
  "geocode.user": ({ userId }) => ensureUserGeo(pool, userId),
  "geocode.backfill": () => backfillRecentServiceRequestGeo(pool, { limit: 15 }),
  "notify.application_received": events.onApplicationReceived,
  "notify.application_status": events.onApplicationStatus,
  "notify.request_canceled": events.onRequestCanceled,
  "notify.request_needs_review": events.onRequestNeedsReview,
  "notify.request_reviewed": events.onRequestReviewed,
  "notify.request_filled": events.onRequestFilled,
  "notify.review_requested": events.onReviewRequested,
  "notify.message_received": async (d) => extraHandlers["notify.message_received"]?.(d),
  "reminders.attendance": () => events.sendAttendanceReminders(),
  "maintenance.hourly": async () => extraHandlers["maintenance.hourly"]?.({}),
  "badges.award": async (d) => extraHandlers["badges.award"]?.(d)
};

/** Handlers registered by modules that would otherwise import this file in a cycle (messaging, reviews). */
const extraHandlers: Partial<{ [K in JobName]: (data: JobMap[K]) => Promise<unknown> }> = {};
export function registerJobHandler<K extends JobName>(name: K, fn: (data: JobMap[K]) => Promise<unknown>) {
  (extraHandlers as Record<string, unknown>)[name] = fn;
}

/** Scheduled jobs a super admin may run on demand (POST /v1/admin/jobs/:name/run). */
export const RUNNABLE_JOBS = ["reminders.attendance", "maintenance.hourly", "geocode.backfill"] as const;
export type RunnableJob = (typeof RUNNABLE_JOBS)[number];
export async function runJobNow(name: RunnableJob) {
  return handlers[name]({} as never);
}

let boss: PgBoss | null = null;
const inline = () => env.JOBS_DISABLED || isTest;

export async function startJobs() {
  if (inline()) return;
  boss = new PgBoss({ connectionString: env.DATABASE_URL_MIGRATIONS || env.DATABASE_URL, schema: "pgboss", max: 3 });
  boss.on("error", (err) => logger.error({ err }, "job queue error"));
  await boss.start();
  for (const name of Object.keys(handlers) as JobName[]) {
    await boss.createQueue(name, { name, retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 120 });
    await boss.work(name, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) await handlers[name](job.data as never);
    });
  }
  if (!env.GEOCODING_DISABLED) await boss.schedule("geocode.backfill", "*/10 * * * *", {});
  await boss.schedule("reminders.attendance", "*/15 * * * *", {});
  await boss.schedule("maintenance.hourly", "7 * * * *", {});
  logger.info("job queue started");
}

export async function stopJobs() {
  if (boss) await boss.stop({ graceful: true, timeout: 5000 });
  boss = null;
}

/** Queue a job; falls back to running it in the background in-process if the queue is unavailable. */
export async function enqueue<K extends JobName>(name: K, data: JobMap[K], opts?: { singletonKey?: string }) {
  if (boss) {
    try {
      await boss.send(name, data as object, { singletonKey: opts?.singletonKey });
      return;
    } catch (err) {
      logger.warn({ err, name }, "enqueue failed; running inline");
    }
  }
  const run = handlers[name](data).catch((err) => logger.warn({ err, name }, "inline job failed"));
  // Tests run jobs synchronously so their effects can be asserted.
  if (isTest) await run;
  else void run;
}
