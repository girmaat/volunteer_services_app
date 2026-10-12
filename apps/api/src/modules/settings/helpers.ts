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

