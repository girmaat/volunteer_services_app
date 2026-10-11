import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireAuthedUser } from "../../middleware/auth";
import { can, type PolicyUser } from "../../lib/policy";
import { getPreferences, isNotificationType, readUnsubscribeToken, setPreference, NOTIFICATION_TYPES, type NotificationType } from "./service";

export function registerNotificationRoutes(app: Express) {
  // In-app notifications (the bell).
  app.get(
    "/v1/notifications",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.string().datetime().optional() }).safeParse(req.query);
      if (!q.success) return res.status(400).json({ message: "Invalid query" });
      const r = await pool.query(
        `SELECT id, type, title, body, href, created_at, read_at FROM notifications
          WHERE user_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
          ORDER BY created_at DESC LIMIT $3`,
        [user.id, q.data.before ?? null, q.data.limit]
      );
      const unread = await pool.query("SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL", [user.id]);
      return res.json({ notifications: r.rows, unread_count: unread.rows[0].c });
    })
  );

  app.get(
    "/v1/notifications/unread-count",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const unread = await pool.query("SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL", [user.id]);
      return res.json({ unread_count: unread.rows[0].c });
    })
  );

  app.post(
    "/v1/notifications/read",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const p = z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }).safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid payload" });
      if (p.data.all) await pool.query("UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL", [user.id]);
      else if (p.data.ids?.length) await pool.query("UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL", [user.id, p.data.ids]);
      // Keep the legacy "last seen" marker in step for the settings activity feed.
      await pool.query(
        `INSERT INTO user_notification_state (user_id, last_seen_at) VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET last_seen_at = NOW()`,
        [user.id]
      );
      return res.json({ ok: true });
    })
  );

  // Per-type preferences (Settings > Notifications).
  app.get(
    "/v1/notifications/preferences",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const staff = can(user as PolicyUser, "platform:moderate");
      return res.json({ preferences: (await getPreferences(String(user.id))).filter((p) => staff || p.type !== "moderation") });
    })
  );

  app.put(
    "/v1/notifications/preferences",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const p = z
        .object({
          preferences: z
            .array(z.object({ type: z.string().refine(isNotificationType, "Unknown type"), email: z.boolean().optional(), in_app: z.boolean().optional() }))
            .max(Object.keys(NOTIFICATION_TYPES).length)
        })
        .safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid payload", errors: p.error.flatten() });
      for (const pref of p.data.preferences) await setPreference(String(user.id), pref.type as NotificationType, pref);
      return res.json({ preferences: await getPreferences(String(user.id)) });
    })
  );

  // One-click unsubscribe (RFC 8058): POST from mail clients, GET/POST from the web page. No login needed.
  const unsubscribe = wrap(async (req, res) => {
    const token = String(req.query.token || req.body?.token || "");
    const parsed = readUnsubscribeToken(token);
    if (!parsed) return res.status(400).json({ message: "This unsubscribe link isn't valid" });
    if (req.method === "POST") await setPreference(parsed.userId, parsed.type, { email: false });
    return res.json({ ok: true, type: parsed.type, label: NOTIFICATION_TYPES[parsed.type].label, unsubscribed: req.method === "POST" });
  });
  app.get("/v1/notifications/unsubscribe", unsubscribe);
  app.post("/v1/notifications/unsubscribe", unsubscribe);
}
