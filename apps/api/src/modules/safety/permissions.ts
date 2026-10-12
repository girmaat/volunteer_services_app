import { pool } from "../../lib/db";

export async function isBlockedBetween(userId: string, peerId: string): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1
    FROM user_blocks b
    WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = $2)
       OR (b.blocker_user_id = $2 AND b.blocked_user_id = $1)
    LIMIT 1
    `,
    [userId, peerId]
  );
  return (r.rowCount ?? 0) > 0;
}

export type MessagingPermission = "anyone" | "verified_only" | "no_one";

export async function getMessagingPermission(userId: string): Promise<MessagingPermission> {
  const r = await pool.query("SELECT messaging_permission FROM user_privacy_settings WHERE user_id = $1", [userId]);
  const perm = r.rowCount ? String(r.rows[0]?.messaging_permission || "anyone") : "anyone";
  if (perm === "verified_only" || perm === "no_one" || perm === "anyone") return perm;
  return "anyone";
}

