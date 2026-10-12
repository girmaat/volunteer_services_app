import crypto from "node:crypto";
import { sendEmail } from "../../auth/email";
import { pool } from "../../lib/db";
import { env, isProduction } from "../../lib/env";
import { logger } from "../../lib/logger";
import { renderEmail, type EmailContent } from "./templates";

/** Every notification type, its settings label, and whether email is on by default. */
export const NOTIFICATION_TYPES = {
  application_received: { label: "Someone applies to your request", email: true },
  application_status: { label: "Your application is accepted, waitlisted or declined", email: true },
  attendance_reminder: { label: "Reminders to confirm before a shift (48 h and 2 h)", email: true },
  message_received: { label: "New messages (email at most once an hour)", email: true },
  review_requested: { label: "Leave a review after something is completed", email: true },
  request_updates: { label: "Your request is approved, declined, canceled or filled", email: true },
  moderation: { label: "Moderation queue: requests waiting for review (staff)", email: true },
  disputes: { label: "Disputes you opened or are part of", email: true },
  hours: { label: "Hours to approve, and decisions on hours you gave", email: true },
  calendar: { label: "Calendar updates when a shift moves or is canceled", email: true },
  prerequisites: { label: "Forms and consent needed before a shift", email: true }
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function isNotificationType(t: string): t is NotificationType {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TYPES, t);
}

export async function getPreferences(userId: string) {
  const r = await pool.query("SELECT type, email, in_app FROM notification_preferences WHERE user_id = $1", [userId]);
  const saved = new Map(r.rows.map((x) => [String(x.type), { email: Boolean(x.email), in_app: Boolean(x.in_app) }]));
  return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => ({
    type,
    label: NOTIFICATION_TYPES[type].label,
    email: saved.get(type)?.email ?? NOTIFICATION_TYPES[type].email,
    in_app: saved.get(type)?.in_app ?? true
  }));
}

export async function setPreference(userId: string, type: NotificationType, patch: { email?: boolean; in_app?: boolean }) {
  await pool.query(
    `INSERT INTO notification_preferences (user_id, type, email, in_app)
     VALUES ($1, $2, COALESCE($3::boolean, $5::boolean), COALESCE($4::boolean, TRUE))
     ON CONFLICT (user_id, type) DO UPDATE SET email = COALESCE($3::boolean, notification_preferences.email),
       in_app = COALESCE($4::boolean, notification_preferences.in_app), updated_at = NOW()`,
    [userId, type, patch.email ?? null, patch.in_app ?? null, NOTIFICATION_TYPES[type].email]
  );
}

// ---- Signed unsubscribe tokens (no table; HMAC over user id + type) ----------------------------

function secret() {
  if (env.NOTIFICATION_SECRET) return env.NOTIFICATION_SECRET;
  if (isProduction) throw new Error("NOTIFICATION_SECRET is required");
  return `dev-only:${env.DATABASE_URL}`;
}

export function unsubscribeToken(userId: string, type: NotificationType) {
  const payload = `${userId}.${type}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function readUnsubscribeToken(token: string): { userId: string; type: NotificationType } | null {
  let decoded = "";
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [userId, type, sig] = decoded.split(".");
  if (!userId || !type || !sig || !isNotificationType(type)) return null;
  const expected = crypto.createHmac("sha256", secret()).update(`${userId}.${type}`).digest("base64url").slice(0, 32);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  return { userId, type };
}

// ---- Delivery -----------------------------------------------------------------------------------

export type NotifyInput = {
  title: string;
  body?: string;
  /** Path in the web app, e.g. /inbox/123. */
  href?: string;
  data?: Record<string, unknown>;
  email?: EmailContent & {
    /** Skip if this key was already emailed (e.g. one reminder per commitment). */
    dedupeKey?: string;
    /** Skip if the same type was emailed to this user within N minutes (digest throttle). */
    throttleMinutes?: number;
  };
};

const webUrl = (path: string) => `${env.WEB_BASE_URL.replace(/\/$/, "")}${path}`;

/** Creates the in-app notification and sends the email, honoring the user's preferences. */
export async function notify(userId: string, type: NotificationType, input: NotifyInput) {
  const prefs = (await getPreferences(userId)).find((p) => p.type === type)!;
  let notificationId: string | null = null;
  if (prefs.in_app) {
    const r = await pool.query(
      "INSERT INTO notifications (user_id, type, title, body, href, data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [userId, type, input.title, input.body ?? "", input.href ?? null, JSON.stringify(input.data ?? {})]
    );
    notificationId = String(r.rows[0].id);
  }
  let emailed = false;
  if (input.email && prefs.email) emailed = await emailUser(userId, type, input.email);
  return { notificationId, emailed };
}

async function emailUser(userId: string, type: NotificationType, content: NonNullable<NotifyInput["email"]>) {
  const u = await pool.query("SELECT email, email_verified_at, banned_until FROM users WHERE id = $1", [userId]);
  const user = u.rows[0];
  if (!user?.email || !user.email_verified_at) return false;
  if (content.throttleMinutes) {
    const recent = await pool.query(
      "SELECT 1 FROM email_log WHERE user_id = $1 AND type = $2 AND created_at > NOW() - ($3::int * INTERVAL '1 minute') LIMIT 1",
      [userId, type, content.throttleMinutes]
    );
    if (recent.rowCount) return false;
  }
  if (content.dedupeKey) {
    const seen = await pool.query("SELECT 1 FROM email_log WHERE dedupe_key = $1", [content.dedupeKey]);
    if (seen.rowCount) return false;
  }
  const token = unsubscribeToken(userId, type);
  const unsubscribeUrl = webUrl(`/unsubscribe?token=${token}`);
  const oneClick = `${env.API_PUBLIC_URL.replace(/\/$/, "")}/v1/notifications/unsubscribe?token=${token}`;
  const rendered = renderEmail(
    { ...content, cta: content.cta ? { ...content.cta, url: content.cta.url.startsWith("http") ? content.cta.url : webUrl(content.cta.url) } : undefined },
    { unsubscribeUrl, preferencesUrl: webUrl("/settings/notifications") }
  );
  const res = await sendEmail({
    to: String(user.email),
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    icalEvent: content.icalEvent
  });
  try {
    await pool.query("INSERT INTO email_log (user_id, type, subject, delivery, dedupe_key) VALUES ($1, $2, $3, $4, $5)", [
      userId,
      type,
      rendered.subject,
      res.delivery,
      content.dedupeKey ?? null
    ]);
  } catch (err) {
    logger.warn({ err }, "email_log insert failed");
  }
  return res.delivery === "smtp" || res.delivery === "logged";
}

/** Notifies everyone who can work the moderation queue. */
export async function notifyModerators(type: NotificationType, input: NotifyInput) {
  const r = await pool.query("SELECT user_id FROM platform_admins WHERE revoked_at IS NULL");
  for (const row of r.rows) await notify(String(row.user_id), type, input);
}

/** Request owner(s): the creator, plus admins/managers of the posting organization. */
export async function requestOwnerIds(requestId: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT r.requester_user_id AS id FROM service_requests r WHERE r.id = $1
     UNION
     SELECT m.user_id FROM service_requests r
       JOIN organization_members m ON m.org_slug = r.requester_org_slug AND m.status = 'active' AND m.role IN ('admin', 'manager')
      WHERE r.id = $1 AND m.user_id IS NOT NULL`,
    [requestId]
  );
  return r.rows.map((x) => String(x.id)).filter(Boolean);
}
