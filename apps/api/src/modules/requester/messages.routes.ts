/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requireRequesterUser } from "../../middleware/auth";
import { canSendDirectMessage, isBlockedBetween } from "../safety/permissions";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";

export function registerRequesterMessagesRoutes(app: Express) {


// Requester area: messages inbox + thread (mirrors volunteer messaging)
app.get(
  "/v1/requester/messages/inbox",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
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
  "/v1/requester/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
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

    const ctxSchema = z.object({
      requestId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional()
    });

    const ctxParsed = ctxSchema.safeParse({
      requestId: typeof req.query.requestId === "string" ? req.query.requestId : undefined,
      applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined
    });

    if (!ctxParsed.success) return res.status(400).json({ message: "Invalid context params" });

    let requestId: string | null = ctxParsed.data.requestId ?? null;
    const applicationId: string | null = ctxParsed.data.applicationId ?? null;

    let context: any = null;

    if (applicationId) {
      const a = await pool.query(
        `
        SELECT
          a.id,
          a.request_id,
          a.volunteer_user_id,
          r.title AS request_title
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });

      const row = a.rows[0];
      if (String(row.volunteer_user_id) !== peerId) {
        return res.status(403).json({ message: "Invalid application context for this peer." });
      }

      const owner = await pool.query("SELECT requester_user_id FROM service_requests WHERE id = $1", [row.request_id]);
      if (owner.rowCount === 0 || String(owner.rows[0].requester_user_id) !== user.id) {
        return res.status(403).json({ message: "You do not have access to this application." });
      }

      requestId = requestId ?? String(row.request_id);
      if (requestId !== String(row.request_id)) {
        return res.status(400).json({ message: "Context mismatch (application vs request)." });
      }

      context = {
        request_id: String(row.request_id),
        request_title: row.request_title,
        application_id: applicationId
      };
    }

    if (requestId && !context) {
      const r = await pool.query("SELECT id, title FROM service_requests WHERE id = $1 AND requester_user_id = $2", [
        requestId,
        user.id
      ]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const ok = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (ok.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }

      context = {
        request_id: String(r.rows[0].id),
        request_title: r.rows[0].title,
        application_id: applicationId
      };
    }

    // Mark unread messages from peer as read (context-scoped)
    await pool.query(
      `
      UPDATE direct_messages
      SET read_at = NOW()
      WHERE sender_user_id = $1 AND recipient_user_id = $2 AND read_at IS NULL
        AND request_id IS NOT DISTINCT FROM $3::uuid
        AND application_id IS NOT DISTINCT FROM $4::uuid
      `,
      [peerId, user.id, requestId, applicationId]
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
        request_id,
        application_id,
        body,
        created_at,
        read_at
      FROM direct_messages
      WHERE (
        (sender_user_id = $1 AND recipient_user_id = $2)
        OR (sender_user_id = $2 AND recipient_user_id = $1)
      )
        AND request_id IS NOT DISTINCT FROM $3::uuid
        AND application_id IS NOT DISTINCT FROM $4::uuid
      ORDER BY created_at ASC
      `,
      [user.id, peerId, requestId, applicationId]
    );

    return res.json({
      peer: peerRes.rows[0],
      context,
      messages: messagesRes.rows
    });
  })
);





app.post(
  "/v1/requester/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
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

    const ctxSchema = z.object({
      requestId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional()
    });

    const ctxParsed = ctxSchema.safeParse({
      requestId: typeof req.query.requestId === "string" ? req.query.requestId : undefined,
      applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined
    });

    if (!ctxParsed.success) return res.status(400).json({ message: "Invalid context params" });

    let requestId: string | null = ctxParsed.data.requestId ?? null;
    const applicationId: string | null = ctxParsed.data.applicationId ?? null;

    if (applicationId) {
      const a = await pool.query(
        `
        SELECT a.request_id, a.volunteer_user_id, r.requester_user_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });
      const row = a.rows[0];

      if (String(row.requester_user_id) !== user.id) {
        return res.status(403).json({ message: "You do not have access to this application." });
      }
      if (String(row.volunteer_user_id) !== peerId) {
        return res.status(403).json({ message: "Invalid application context for this peer." });
      }

      requestId = requestId ?? String(row.request_id);
      if (requestId !== String(row.request_id)) {
        return res.status(400).json({ message: "Context mismatch (application vs request)." });
      }
    }

    if (requestId) {
      const r = await pool.query("SELECT id FROM service_requests WHERE id = $1 AND requester_user_id = $2", [requestId, user.id]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const ok = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (ok.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }
    }

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
      "INSERT INTO direct_messages (sender_user_id, recipient_user_id, request_id, application_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at",
      [user.id, peerId, requestId, applicationId, parsed.data.body]
    );

    return res.status(201).json({ messageId: insert.rows[0]?.id, createdAt: insert.rows[0]?.created_at });
  })
);
}
