/**
 * Live inbox updates. Events go through Postgres LISTEN/NOTIFY so every API instance hears them,
 * then fan out to Server-Sent Event subscribers in this process. Falls back to in-process only
 * (tests, or if the listener can't connect); clients also poll every 10 s.
 */
import { EventEmitter } from "node:events";
import { Client } from "pg";
import { pool } from "../../lib/db";
import { env, isTest } from "../../lib/env";
import { logger } from "../../lib/logger";

export type InboxEvent = { type: "message" | "conversation"; conversationId: string; userIds: string[]; messageId?: string };

const CHANNEL = "inbox_events";
const emitter = new EventEmitter();
emitter.setMaxListeners(0);
let listener: Client | null = null;

export async function startRealtime() {
  if (isTest || listener) return;
  try {
    const c = new Client({ connectionString: env.DATABASE_URL });
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    c.on("notification", (msg) => {
      try {
        emitter.emit("event", JSON.parse(String(msg.payload)) as InboxEvent);
      } catch {
        /* ignore malformed payloads */
      }
    });
    c.on("error", (err) => {
      logger.warn({ err }, "inbox listener error; falling back to in-process events");
      listener = null;
    });
    listener = c;
  } catch (err) {
    logger.warn({ err }, "inbox listener unavailable; using in-process events");
  }
}

export async function stopRealtime() {
  const c = listener;
  listener = null;
  if (c) await c.end().catch(() => {});
}

export async function publish(evt: InboxEvent) {
  if (!listener) {
    emitter.emit("event", evt);
    return;
  }
  // NOTIFY payloads are capped at 8 KB; events carry ids only.
  await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, JSON.stringify(evt)]).catch(() => emitter.emit("event", evt));
}

export function subscribe(userId: string, fn: (e: InboxEvent) => void) {
  const handler = (e: InboxEvent) => {
    if (e.userIds.includes(userId)) fn(e);
  };
  emitter.on("event", handler);
  return () => emitter.off("event", handler);
}
