import { pool } from "../../lib/db";

// ------------------------------------------------------------
// Shared Settings (All logged-in users): Blocked users + Reports filed
// ------------------------------------------------------------


// ------------------------------------------------------------
// Shared Settings (All logged-in users): Notifications Center
// ------------------------------------------------------------

export type NotificationItem = {
  id: string;
  type: "message" | "new_application" | "application_update" | "review_received";
  created_at: string;
  seen: boolean;
  title: string;
  body: string;
  href: string | null;
};

export async function getNotificationLastSeen(userId: string): Promise<Date> {
  const r = await pool.query("SELECT last_seen_at FROM user_notification_state WHERE user_id = $1", [userId]);
  if ((r.rowCount ?? 0) === 0 || !r.rows[0]?.last_seen_at) return new Date(0);
  return new Date(r.rows[0].last_seen_at);
}

export async function setNotificationLastSeenNow(userId: string) {
  await pool.query(
    `
    INSERT INTO user_notification_state (user_id, last_seen_at)
    VALUES ($1, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
    `,
    [userId]
  );
}

export function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.min(max, Math.max(min, i));
}

export function formatStatus(s: string | null) {
  if (!s) return "Update";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
