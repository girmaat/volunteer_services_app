import { pool } from "../../lib/db";
import { notify } from "../notifications/service";
import { loadConversation, participantIds } from "./service";

/** In-app notification per conversation (collapsed) + email digest at most once an hour. */
export async function onMessageReceived({ messageId }: { messageId: string }) {
  const m = await pool.query(
    `SELECT m.id, m.sender_user_id, m.conversation_id, m.status, COALESCE(NULLIF(p.display_name, ''), 'Someone') AS sender_name
       FROM direct_messages m LEFT JOIN user_profiles p ON p.user_id = m.sender_user_id WHERE m.id = $1`,
    [messageId]
  );
  const msg = m.rows[0];
  if (!msg || msg.status !== "sent" || !msg.conversation_id) return;
  const c = await loadConversation(String(msg.conversation_id));
  if (!c) return;
  const href = `/inbox/${c.id}`;
  for (const uid of await participantIds(c)) {
    if (uid === msg.sender_user_id) continue;
    // One unread notification per conversation: refresh it instead of stacking.
    const existing = await pool.query(
      "UPDATE notifications SET created_at = NOW(), title = $3 WHERE user_id = $1 AND type = 'message_received' AND read_at IS NULL AND data->>'conversationId' = $2 RETURNING id",
      [uid, c.id, `New messages from ${msg.sender_name}`]
    );
    if (existing.rowCount) continue;
    await notify(uid, "message_received", {
      title: `New message from ${msg.sender_name}`,
      body: c.request_title ? `About “${c.request_title}”` : "",
      href,
      data: { conversationId: c.id },
      email: {
        subject: `New message from ${msg.sender_name}`,
        heading: `${msg.sender_name} sent you a message`,
        lines: [c.request_title ? `It's about “${c.request_title}”.` : "Open your inbox to read and reply."],
        cta: { label: "Read and reply", url: href },
        note: "For your safety, keep conversations on Volunteer Services and never share bank details or passwords.",
        throttleMinutes: 60
      }
    });
  }
}

/** Hourly: archive conversations 14 days after their request finished; complete requests whose work is done. */
export async function hourlyMaintenance() {
  const archived = await pool.query(
    `UPDATE conversations c SET status = 'archived', archived_at = NOW()
       FROM service_requests r
      WHERE r.id = c.request_id AND c.status <> 'archived'
        AND ((r.status = 'completed' AND r.completed_at < NOW() - INTERVAL '14 days')
          OR (r.status = 'canceled' AND r.canceled_at < NOW() - INTERVAL '14 days'))
      RETURNING c.id`
  );
  return { archived: archived.rowCount ?? 0 };
}
