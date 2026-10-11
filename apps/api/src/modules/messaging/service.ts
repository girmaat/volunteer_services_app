import { pool } from "../../lib/db";
import { orgMembership, type PolicyUser } from "../../lib/policy";
import { enqueue } from "../../jobs/queue";
import { isBlockedBetween } from "../safety/permissions";
import { publish } from "./realtime";
import { holdReason, maskContacts } from "./safety";

export type Conversation = {
  id: string;
  kind: "request" | "direct";
  request_id: string | null;
  application_id: string | null;
  org_slug: string | null;
  volunteer_user_id: string;
  owner_user_id: string;
  status: "active" | "ended" | "archived";
  ended_at: string | null;
  archived_at: string | null;
  last_message_at: string | null;
  created_at: string;
  application_status: string | null;
  request_title: string | null;
  request_status: string | null;
};

export type Side = "volunteer" | "owner";

const CONV_SELECT = `SELECT c.*, a.status AS application_status, r.title AS request_title, r.status AS request_status
  FROM conversations c
  LEFT JOIN request_applications a ON a.id = c.application_id
  LEFT JOIN service_requests r ON r.id = c.request_id`;

/** Contact details stay masked until the volunteer is accepted. */
export const contactsUnlocked = (c: Pick<Conversation, "application_status">) => ["accepted", "confirmed", "completed"].includes(String(c.application_status || ""));

/** Which side the user is on, or null if they can't see the conversation. Org admins/managers act for the organization. */
export function sideOf(user: PolicyUser, c: Conversation): Side | null {
  if (c.volunteer_user_id === user.id) return "volunteer";
  if (c.owner_user_id === user.id) return "owner";
  if (c.org_slug) {
    const m = orgMembership(user, c.org_slug);
    if (m && (m.role === "admin" || m.role === "manager")) return "owner";
  }
  return null;
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const r = await pool.query(`${CONV_SELECT} WHERE c.id = $1`, [id]);
  return (r.rows[0] as Conversation) ?? null;
}

/** Everyone who should hear about activity in a conversation. */
export async function participantIds(c: Conversation): Promise<string[]> {
  const ids = new Set([c.volunteer_user_id, c.owner_user_id]);
  if (c.org_slug) {
    const r = await pool.query("SELECT user_id FROM organization_members WHERE org_slug = $1 AND status = 'active' AND role IN ('admin','manager') AND user_id IS NOT NULL", [c.org_slug]);
    for (const row of r.rows) ids.add(String(row.user_id));
  }
  return [...ids];
}

/** Finds or creates the conversation between a request's owner and a volunteer. */
export async function ensureConversation(requestId: string, volunteerUserId: string): Promise<Conversation> {
  const r = await pool.query(
    `INSERT INTO conversations (kind, request_id, application_id, org_slug, volunteer_user_id, owner_user_id)
     SELECT 'request', r.id,
            (SELECT a.id FROM request_applications a WHERE a.request_id = r.id AND a.volunteer_user_id = $2 ORDER BY a.created_at DESC LIMIT 1),
            r.requester_org_slug, $2, r.requester_user_id
       FROM service_requests r WHERE r.id = $1 AND r.requester_user_id <> $2
     ON CONFLICT (request_id, volunteer_user_id) WHERE request_id IS NOT NULL
     DO UPDATE SET application_id = COALESCE(EXCLUDED.application_id, conversations.application_id)
     RETURNING id`,
    [requestId, volunteerUserId]
  );
  if (!r.rowCount) throw new Error("Request not found");
  return (await loadConversation(String(r.rows[0].id)))!;
}

export type ListScope = "volunteer" | "requester" | "org" | "all";

export async function listConversations(user: PolicyUser, scope: ListScope) {
  const org = scope === "org" ? orgMembership(user) : null;
  const where =
    scope === "volunteer"
      ? "c.volunteer_user_id = $1"
      : scope === "requester"
        ? "c.owner_user_id = $1 AND c.org_slug IS NULL"
        : scope === "org"
          ? "c.org_slug = $2"
          : `(c.volunteer_user_id = $1 OR c.owner_user_id = $1 OR c.org_slug = ANY($3::text[]))`;
  const manageable = (user.orgs || []).filter((o) => o.role === "admin" || o.role === "manager").map((o) => o.slug);
  const r = await pool.query(
    `SELECT c.id, c.kind, c.status, c.request_id, c.org_slug, c.volunteer_user_id, c.owner_user_id, c.last_message_at, c.created_at,
            a.status AS application_status, r.title AS request_title,
            vp.display_name AS volunteer_name, op.display_name AS owner_name, o.name AS org_name,
            vp.avatar_url AS volunteer_avatar, op.avatar_url AS owner_avatar, o.logo_url AS org_logo,
            lm.body AS last_body, lm.sender_user_id AS last_sender_id,
            (SELECT COUNT(*)::int FROM direct_messages m WHERE m.conversation_id = c.id AND m.status = 'sent' AND m.sender_user_id <> $1
               AND m.created_at > COALESCE((SELECT last_read_at FROM conversation_reads cr WHERE cr.conversation_id = c.id AND cr.user_id = $1), 'epoch')) AS unread
       FROM conversations c
       LEFT JOIN request_applications a ON a.id = c.application_id
       LEFT JOIN service_requests r ON r.id = c.request_id
       LEFT JOIN user_profiles vp ON vp.user_id = c.volunteer_user_id
       LEFT JOIN user_profiles op ON op.user_id = c.owner_user_id
       LEFT JOIN organizations o ON o.slug = c.org_slug
       LEFT JOIN LATERAL (SELECT body, sender_user_id FROM direct_messages m WHERE m.conversation_id = c.id AND (m.status = 'sent' OR m.sender_user_id = $1)
                           ORDER BY m.created_at DESC LIMIT 1) lm ON TRUE
      WHERE ${where}
        AND ($2::text IS NULL OR TRUE) AND ($3::text[] IS NULL OR TRUE)
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      LIMIT 200`,
    [user.id, org?.slug ?? null, manageable]
  );
  return r.rows.map((row) => {
    const unlocked = contactsUnlocked(row);
    const iAmVolunteer = row.volunteer_user_id === user.id;
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      request_id: row.request_id,
      request_title: row.request_title,
      // The other party, as you see them.
      with_name: iAmVolunteer ? row.org_name || row.owner_name || "Organizer" : row.volunteer_name || "Volunteer",
      with_avatar_url: (iAmVolunteer ? (row.org_slug ? row.org_logo : row.owner_avatar) : row.volunteer_avatar) || null,
      as: iAmVolunteer ? "volunteer" : "owner",
      application_status: row.application_status,
      contacts_unlocked: unlocked,
      last_message_at: row.last_message_at,
      // Your own last message is never masked back to you.
      last_body: row.last_body ? (unlocked || row.last_sender_id === user.id ? row.last_body : maskContacts(String(row.last_body))).slice(0, 140) : null,
      unread: row.unread
    };
  });
}

export async function messagesFor(user: PolicyUser, c: Conversation, opts: { after?: string | null; limit: number }) {
  const unlocked = contactsUnlocked(c);
  const r = await pool.query(
    `SELECT m.id, m.sender_user_id, m.body, m.status, m.held_reason, m.created_at, m.attachment_id,
            att.file_name AS attachment_name, att.mime_type AS attachment_type, att.size_bytes AS attachment_size,
            COALESCE(NULLIF(p.display_name, ''), 'Member') AS sender_name
       FROM direct_messages m
       LEFT JOIN message_attachments att ON att.id = m.attachment_id
       LEFT JOIN user_profiles p ON p.user_id = m.sender_user_id
      WHERE m.conversation_id = $1
        AND (m.status = 'sent' OR m.sender_user_id = $2)
        AND ($3::timestamptz IS NULL OR m.created_at > $3::timestamptz)
      ORDER BY m.created_at ASC
      LIMIT $4`,
    [c.id, user.id, opts.after ?? null, opts.limit]
  );
  return r.rows.map((m) => ({
    id: m.id,
    mine: m.sender_user_id === user.id,
    sender_name: m.sender_name,
    // Your own words are never masked back to you.
    body: unlocked || m.sender_user_id === user.id ? m.body : maskContacts(String(m.body)),
    // Senders see held/undelivered status; shadow-banned senders see their messages as normal.
    status: m.status === "shadow" ? "sent" : m.status,
    held_reason: m.sender_user_id === user.id && m.status === "held" ? m.held_reason : null,
    attachment: m.attachment_id ? { id: m.attachment_id, name: m.attachment_name, type: m.attachment_type, size: m.attachment_size } : null,
    created_at: m.created_at
  }));
}

export async function markRead(userId: string, conversationId: string) {
  await pool.query(
    `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at) VALUES ($1, $2, NOW())
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
    [conversationId, userId]
  );
  await pool.query("UPDATE direct_messages SET read_at = NOW() WHERE conversation_id = $1 AND recipient_user_id = $2 AND read_at IS NULL", [conversationId, userId]);
}

export class SendError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const MAX_PER_10_MIN = 30;
const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_FIRST_CONTACTS_PER_DAY = 5;

/** Sends a message after every safety check. Returns the stored message. */
export async function sendMessage(user: PolicyUser, c: Conversation, body: string, attachmentId: string | null = null) {
  const side = sideOf(user, c);
  if (!side) throw new SendError(404, "not_found", "Conversation not found");
  if (c.status !== "active") throw new SendError(409, "closed", c.status === "ended" ? "This conversation was ended." : "This conversation is archived and read-only.");
  const other = side === "volunteer" ? c.owner_user_id : c.volunteer_user_id;
  if (await isBlockedBetween(user.id, other)) throw new SendError(403, "blocked", "This conversation is unavailable because one of you has blocked the other.");

  const stats = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 86400 AS age_days,
            (SELECT COUNT(*)::int FROM direct_messages WHERE sender_user_id = $1 AND created_at > NOW() - INTERVAL '10 minutes') AS recent,
            EXISTS (SELECT 1 FROM direct_messages WHERE sender_user_id = $1 AND conversation_id = $2) AS has_sent_here,
            (SELECT COUNT(DISTINCT conversation_id)::int FROM direct_messages d
              WHERE d.sender_user_id = $1 AND d.created_at > NOW() - INTERVAL '1 day'
                AND NOT EXISTS (SELECT 1 FROM direct_messages e WHERE e.sender_user_id = $1 AND e.conversation_id = d.conversation_id AND e.created_at < d.created_at)) AS first_contacts_today
       FROM users u WHERE u.id = $1`,
    [user.id, c.id]
  );
  const s = stats.rows[0];
  if (Number(s.recent) >= MAX_PER_10_MIN) throw new SendError(429, "rate_limited", "You're sending messages very quickly. Wait a few minutes and try again.");
  const ageDays = Number(s.age_days);
  if (!s.has_sent_here && ageDays < NEW_ACCOUNT_DAYS && Number(s.first_contacts_today) >= NEW_ACCOUNT_FIRST_CONTACTS_PER_DAY) {
    throw new SendError(429, "first_contact_limit", "New accounts can start a few conversations a day. Try again tomorrow.");
  }

  const unlocked = contactsUnlocked(c);
  const reason = holdReason(body, { unlocked, senderAgeDays: ageDays });
  const status = user.shadow_banned ? "shadow" : reason ? "held" : "sent";
  const ins = await pool.query(
    `INSERT INTO direct_messages (sender_user_id, recipient_user_id, body, request_id, application_id, conversation_id, status, held_reason, attachment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, created_at`,
    [user.id, other, body, c.request_id, c.application_id, c.id, status, reason, attachmentId]
  );
  const messageId = String(ins.rows[0].id);
  await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = $1", [c.id]);
  await markRead(user.id, c.id);
  if (status === "sent") await deliver(c, messageId);
  else await publish({ type: "message", conversationId: c.id, userIds: [user.id], messageId });
  return { id: messageId, created_at: ins.rows[0].created_at, status: status === "shadow" ? "sent" : status, held_reason: reason };
}

/** Tells participants about a delivered message (live event + notification). */
export async function deliver(c: Conversation, messageId: string) {
  await publish({ type: "message", conversationId: c.id, userIds: await participantIds(c), messageId });
  await enqueue("notify.message_received", { messageId });
}
