/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requireVolunteerUser } from "../../middleware/auth";
import { canSendDirectMessage, isBlockedBetween } from "../safety/permissions";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";

export function registerVolunteerMessagesRoutes(app: Express) {


app.get(
  "/v1/volunteer/messages/inbox",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      WITH msgs AS (
        SELECT
          CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS peer_id,
          sender_user_id,
          recipient_user_id,
          request_id,
          application_id,
          body,
          created_at,
          read_at
        FROM direct_messages
        WHERE sender_user_id = $1 OR recipient_user_id = $1
      ),
      agg AS (
        SELECT
          peer_id,
          request_id,
          application_id,
          MAX(created_at) AS last_at,
          COUNT(*) FILTER (WHERE recipient_user_id = $1 AND read_at IS NULL) AS unread_count
        FROM msgs
        WHERE NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = peer_id)
             OR (b.blocker_user_id = peer_id AND b.blocked_user_id = $1)
        )
        GROUP BY peer_id, request_id, application_id
      ),
      last_msg AS (
        SELECT DISTINCT ON (peer_id, request_id, application_id)
          peer_id,
          request_id,
          application_id,
          body AS last_body,
          created_at AS last_at
        FROM msgs
        ORDER BY peer_id, request_id, application_id, created_at DESC
      )
      SELECT
        a.peer_id,
        a.request_id,
        a.application_id,
        r.title AS request_title,
        u.email AS peer_email,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS peer_display_name,
        p.avatar_url AS peer_avatar_url,
        COALESCE(p.public_location, p.location) AS peer_public_location,
        l.last_body,
        l.last_at,
        a.unread_count::int AS unread_count
      FROM agg a
      JOIN last_msg l ON l.peer_id = a.peer_id
        AND l.request_id IS NOT DISTINCT FROM a.request_id
        AND l.application_id IS NOT DISTINCT FROM a.application_id
      JOIN users u ON u.id = a.peer_id
      LEFT JOIN user_profiles p ON p.user_id = a.peer_id
      LEFT JOIN service_requests r ON r.id = a.request_id
      ORDER BY l.last_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.get(
  "/v1/volunteer/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const peerIdParsed = z.string().uuid().safeParse(req.params.peerId);
    if (!peerIdParsed.success) return res.status(400).json({ message: "Invalid peer id" });
    const peerId = peerIdParsed.data;

    if (await isBlockedBetween(user.id, peerId)) {
      return res
        .status(403)
        .json({ message: "This conversation is unavailable because one of you has blocked the other." });
    }

    if (peerId === user.id) return res.status(400).json({ message: "Invalid peer id" });

    // Mark unread messages from peer as read
    await pool.query(
      "UPDATE direct_messages SET read_at = NOW() WHERE sender_user_id = $1 AND recipient_user_id = $2 AND read_at IS NULL",
      [peerId, user.id]
    );

    const peerRes = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS display_name,
        p.avatar_url,
        COALESCE(p.public_location, p.location) AS public_location
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [peerId]
    );
    if (peerRes.rowCount === 0) return res.status(404).json({ message: "Peer not found" });

    const messagesRes = await pool.query(
      `
      SELECT
        id,
        sender_user_id,
        recipient_user_id,
        body,
        created_at,
        read_at
      FROM direct_messages
      WHERE (sender_user_id = $1 AND recipient_user_id = $2)
         OR (sender_user_id = $2 AND recipient_user_id = $1)
      ORDER BY created_at ASC
      `,
      [user.id, peerId]
    );

    return res.json({
      peer: peerRes.rows[0],
      messages: messagesRes.rows
    });
  })
);



app.post(
  "/v1/volunteer/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const peerIdParsed = z.string().uuid().safeParse(req.params.peerId);
    if (!peerIdParsed.success) return res.status(400).json({ message: "Invalid peer id" });
    const peerId = peerIdParsed.data;

    if (await isBlockedBetween(user.id, peerId)) {
      return res
        .status(403)
        .json({ message: "This conversation is unavailable because one of you has blocked the other." });
    }

    if (peerId === user.id) return res.status(400).json({ message: "Invalid peer id" });

    const schema = z.object({ body: z.string().min(1).max(5000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const peerRes = await pool.query("SELECT id FROM users WHERE id = $1", [peerId]);
    if (peerRes.rowCount === 0) return res.status(404).json({ message: "Peer not found" });

    const perm = await canSendDirectMessage(user, peerId);
    if (!perm.allowed) {
      return res.status(403).json({ message: perm.reason || "This user is not accepting direct messages." });
    }

    const insert = await pool.query(
      "INSERT INTO direct_messages (sender_user_id, recipient_user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at",
      [user.id, peerId, parsed.data.body]
    );

    return res.status(201).json({ messageId: insert.rows[0]?.id, createdAt: insert.rows[0]?.created_at });
  })
);
}
