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

export async function canSendDirectMessage(sender: any, recipientUserId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!recipientUserId) return { allowed: false, reason: "Invalid recipient." };
  if (String(sender?.id || "") === String(recipientUserId)) return { allowed: true };
  if (sender?.is_platform_admin) return { allowed: true };

  const perm = await getMessagingPermission(recipientUserId);
  if (perm === "anyone") return { allowed: true };

  if (perm === "verified_only") {
    // Login requires verified email, but keep the check for safety.
    if (sender?.email_verified_at) return { allowed: true };
    return { allowed: false, reason: "Only verified users can message this user." };
  }

  // perm === 'no_one'
  return { allowed: false, reason: "This user is not accepting direct messages right now." };
}
