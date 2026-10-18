/**
 * Unified inbox (Phase 4.6): one implementation for volunteers, requesters and organizations.
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { ReportBody, SendMessageBody } from "@volunteer_services_app/contracts";
import { pool } from "../../lib/db";
import { contentDisposition, wrap } from "../../lib/http";
import { can, type PolicyUser } from "../../lib/policy";
import { requireAuthedUser } from "../../middleware/auth";
import { requirePlatformAdmin } from "../../admin/auth";
import { checkAttachment, MAX_ATTACHMENT_BYTES } from "./files";
import { subscribe, publish } from "./realtime";
import {
  contactsUnlocked,
  ensureConversation,
  ensureSupportConversation,
  ownerHasWritten,
  REPLY_ONLY_MESSAGE,
  listConversations,
  loadConversation,
  markRead,
  messagesFor,
  participantIds,
  sendMessage,
  SendError,
  sideOf,
  type Conversation,
  type ListScope
} from "./service";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });

async function withConversation(req: Request, res: Response): Promise<{ user: PolicyUser; c: Conversation } | null> {
  const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
  if (!user) return null;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ message: "Invalid conversation id" });
    return null;
  }
  const c = await loadConversation(id.data);
  if (!c || !sideOf(user, c)) {
    res.status(404).json({ message: "Conversation not found" });
    return null;
  }
  return { user, c };
}

function sendError(res: Response, e: unknown) {
  if (e instanceof SendError) return res.status(e.status).json({ error: { code: e.code, message: e.message }, message: e.message });
  throw e;
}

function defaultScope(user: PolicyUser): ListScope {
  const ctx = String(user.active_context || "");
  if (ctx.startsWith("org:")) return "org";
  if (ctx === "requester" || ctx === "volunteer") return ctx;
  return "all";
}

async function conversationView(user: PolicyUser, c: Conversation) {
  const side = sideOf(user, c)!;
  const names = await pool.query(
    `SELECT (SELECT display_name FROM user_profiles WHERE user_id = $1) AS volunteer_name,
            (SELECT display_name FROM user_profiles WHERE user_id = $2) AS owner_name,
            (SELECT name FROM organizations WHERE slug = $3) AS org_name`,
    [c.volunteer_user_id, c.owner_user_id, c.org_slug]
  );
  const n = names.rows[0];
  const replyOnlyWaiting = side === "volunteer" && c.kind !== "support" && !(await ownerHasWritten(c));
  const supportOrg = c.kind === "support" ? (await pool.query("SELECT name FROM organizations WHERE slug = (SELECT support_org_slug FROM conversations WHERE id = $1)", [c.id])).rows[0]?.name : null;
  return {
    id: c.id,
    status: c.status,
    request_id: c.request_id,
    request_title: c.request_title,
    request_status: c.request_status,
    application_id: c.application_id,
    application_status: c.application_status,
    as: side,
    kind: c.kind,
    with_name:
      c.kind === "support"
        ? side === "volunteer"
          ? "Volunteer Services support"
          : `${n.volunteer_name || "Member"}${supportOrg ? ` (${supportOrg})` : ""}`
        : side === "volunteer"
          ? n.org_name || n.owner_name || "Organizer"
          : n.volunteer_name || "Volunteer",
    with_user_id: side === "volunteer" ? c.owner_user_id : c.volunteer_user_id,
    contacts_unlocked: contactsUnlocked(c),
    can_send: c.status === "active" && !replyOnlyWaiting,
    // Volunteers reply only: true until the organizer sends the first message.
    waiting_for_organizer: replyOnlyWaiting,
    reply_only_message: replyOnlyWaiting ? REPLY_ONLY_MESSAGE : null,
    archived_at: c.archived_at,
    ended_at: c.ended_at
  };
}

export function registerMessagingRoutes(app: Express) {
  app.get(
    "/v1/inbox/conversations",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const q = z.object({ as: z.enum(["volunteer", "requester", "org", "all"]).optional() }).safeParse(req.query);
      if (!q.success) return res.status(400).json({ message: "Invalid query" });
      const scope = q.data.as ?? defaultScope(user);
      if (scope === "org" && !can(user, "org:act")) return res.status(403).json({ message: "Forbidden" });
      return res.json({ scope, conversations: await listConversations(user, scope) });
    })
  );


  // Start (or reopen) the conversation for a request. Volunteers must have applied; owners pick an applicant.
  app.post(
    "/v1/inbox/conversations",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const p = z.object({ requestId: z.string().uuid(), volunteerUserId: z.string().uuid().optional() }).safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid payload", errors: p.error.flatten() });
      const volunteerId = p.data.volunteerUserId ?? user.id;
      const app_ = await pool.query("SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1", [p.data.requestId, volunteerId]);
      if (!app_.rowCount) return res.status(404).json({ message: "Conversations start from an application" });
      const c = await ensureConversation(p.data.requestId, volunteerId).catch(() => null);
      if (!c || !sideOf(user, c)) return res.status(404).json({ message: "Conversation not found" });
      return res.status(201).json(await conversationView(user, c));
    })
  );

  // Organization members message the platform team (girma-fixes #17). One thread per person.
  app.post(
    "/v1/inbox/support",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const m = (user.orgs || [])[0] ? (user.orgs || []).find((o) => `org:${o.slug}` === user.active_context) || (user.orgs || [])[0] : null;
      if (!m) return res.status(403).json({ message: "Messaging the Volunteer Services team is available to organization members. Use the contact form instead." });
      const p = z.object({ body: z.string().trim().min(1).max(5000).optional() }).safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid payload", errors: p.error.flatten() });
      const c = await ensureSupportConversation(user.id, m.slug);
      if (!c) return res.status(503).json({ message: "The Volunteer Services team isn't set up to receive messages yet. Use the contact form." });
      if (p.data.body) {
        try {
          await sendMessage(user, c, p.data.body);
        } catch (e) {
          return sendError(res, e);
        }
      }
      return res.status(201).json(await conversationView(user, (await loadConversation(c.id))!));
    })
  );

  // Platform admins: every support thread.
  app.get(
    "/v1/admin/support",
    wrap(async (req, res) => {
      if (!(await requirePlatformAdmin(pool, req, res))) return;
      const r = await pool.query(
        `SELECT c.id, c.status, c.last_message_at, c.created_at, p.display_name AS member_name, o.name AS org_name,
                (SELECT body FROM direct_messages m WHERE m.conversation_id = c.id AND m.status = 'sent' ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                (SELECT sender_user_id = c.volunteer_user_id FROM direct_messages m WHERE m.conversation_id = c.id AND m.status = 'sent' ORDER BY m.created_at DESC LIMIT 1) AS awaiting_reply
           FROM conversations c
           LEFT JOIN user_profiles p ON p.user_id = c.volunteer_user_id
           LEFT JOIN organizations o ON o.slug = c.support_org_slug
          WHERE c.kind = 'support'
          ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
          LIMIT 200`
      );
      return res.json({
        items: r.rows.map((x) => ({ ...x, last_body: x.last_body ? String(x.last_body).slice(0, 140) : null, awaiting_reply: Boolean(x.awaiting_reply) }))
      });
    })
  );

  app.get(
    "/v1/inbox/conversations/:id",
    wrap(async (req, res) => {
      const ok = await withConversation(req, res);
      if (!ok) return;
      const messages = await messagesFor(ok.user, ok.c, { limit: 500 });
      await markRead(ok.user.id, ok.c.id);
      return res.json({ conversation: await conversationView(ok.user, ok.c), messages });
    })
  );

  // Polling fallback (every ~10 s) when the live stream isn't available.
  app.get(
    "/v1/inbox/conversations/:id/messages",
    wrap(async (req, res) => {
      const ok = await withConversation(req, res);
      if (!ok) return;
      const q = z.object({ after: z.string().datetime({ offset: true }).optional() }).safeParse(req.query);
      if (!q.success) return res.status(400).json({ message: "Invalid query" });
      const messages = await messagesFor(ok.user, ok.c, { after: q.data.after ?? null, limit: 200 });
      if (messages.length) await markRead(ok.user.id, ok.c.id);
      return res.json({ messages, status: ok.c.status });
    })
  );

  app.post(
    "/v1/inbox/conversations/:id/messages",
    wrap(async (req, res) => {
      const ok = await withConversation(req, res);
      if (!ok) return;
      const p = SendMessageBody.safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Write a message first", errors: p.error.flatten() });
      try {
        return res.status(201).json(await sendMessage(ok.user, ok.c, p.data.body));
      } catch (e) {
        return sendError(res, e);
      }
    })
  );

  app.post(
    "/v1/inbox/conversations/:id/attachments",
    upload.single("file"),
    wrap(async (req, res) => {
      const ok = await withConversation(req, res);
      if (!ok) return;
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) return res.status(400).json({ message: "Choose a file to share" });
      const name = String(file.originalname || "file").slice(0, 150);
      const check = await checkAttachment(file.buffer, name);
      if (!check.ok) return res.status(422).json({ error: { code: "file_rejected", message: check.reason }, message: check.reason });
      if (ok.c.status !== "active") return res.status(409).json({ message: "This conversation is read-only." });
      const att = await pool.query(
        "INSERT INTO message_attachments (conversation_id, uploader_user_id, file_name, mime_type, size_bytes, sha256, bytes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [ok.c.id, ok.user.id, name, check.mime, file.size, check.sha256, file.buffer]
      );
      const note = String((req.body as { body?: string })?.body || "").trim().slice(0, 2000) || `Shared a file: ${name}`;
      try {
        const msg = await sendMessage(ok.user, ok.c, note, String(att.rows[0].id));
        return res.status(201).json({ ...msg, attachment_id: att.rows[0].id });
      } catch (e) {
        await pool.query("DELETE FROM message_attachments WHERE id = $1", [att.rows[0].id]);
        return sendError(res, e);
      }
    })
  );

  app.get(
    "/v1/inbox/attachments/:id",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const r = await pool.query(
        `SELECT a.file_name, a.mime_type, a.bytes, a.conversation_id,
                EXISTS (SELECT 1 FROM direct_messages m WHERE m.attachment_id = a.id AND (m.status = 'sent' OR m.sender_user_id = $2)) AS visible
           FROM message_attachments a WHERE a.id = $1 AND a.scan_status = 'clean'`,
        [id.data, user.id]
      );
      const row = r.rows[0];
      const c = row ? await loadConversation(String(row.conversation_id)) : null;
      if (!row || !row.visible || !c || !sideOf(user, c)) return res.status(404).json({ message: "File not found" });
      res.setHeader("content-type", row.mime_type);
      res.setHeader("content-disposition", contentDisposition(row.file_name));
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("cache-control", "private, no-store");
      return res.send(row.bytes);
    })
  );

  app.post(
    "/v1/inbox/conversations/:id/end",
    wrap(async (req, res) => {
      const ok = await withConversation(req, res);
      if (!ok) return;
      if (ok.c.status !== "active") return res.json({ status: ok.c.status });
      await pool.query("UPDATE conversations SET status = 'ended', ended_at = NOW(), ended_by_user_id = $2 WHERE id = $1", [ok.c.id, ok.user.id]);
      await publish({ type: "conversation", conversationId: ok.c.id, userIds: await participantIds(ok.c) });
      return res.json({ status: "ended" });
    })
  );

  app.post(
    "/v1/inbox/conversations/:id/block",
    wrap(async (req, res) => {
      const ok = await withConversation(req, res);
      if (!ok) return;
      const other = sideOf(ok.user, ok.c) === "volunteer" ? ok.c.owner_user_id : ok.c.volunteer_user_id;
      const reason = typeof req.body?.reason === "string" ? String(req.body.reason).slice(0, 500) : null;
      await pool.query("INSERT INTO user_blocks (blocker_user_id, blocked_user_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [ok.user.id, other, reason]);
      await pool.query("UPDATE conversations SET status = 'ended', ended_at = COALESCE(ended_at, NOW()), ended_by_user_id = COALESCE(ended_by_user_id, $2) WHERE id = $1", [ok.c.id, ok.user.id]);
      await publish({ type: "conversation", conversationId: ok.c.id, userIds: await participantIds(ok.c) });
      return res.json({ status: "ended", blocked: true });
    })
  );

  app.post(
    "/v1/inbox/conversations/:id/report",
    wrap(async (req, res) => {
      const ok = await withConversation(req, res);
      if (!ok) return;
      const p = ReportBody.safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid payload", errors: p.error.flatten() });
      const other = sideOf(ok.user, ok.c) === "volunteer" ? ok.c.owner_user_id : ok.c.volunteer_user_id;
      const r = await pool.query(
        `INSERT INTO user_reports (reporter_user_id, target_user_id, target_request_id, category, details)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [ok.user.id, other, ok.c.request_id, p.data.category, `[conversation ${ok.c.id}${p.data.messageId ? ` message ${p.data.messageId}` : ""}] ${p.data.details ?? ""}`.trim()]
      );
      return res.status(201).json({ reportId: r.rows[0].id });
    })
  );

  // Server-Sent Events: one stream per signed-in tab. The web app proxies it through /api/inbox/stream.
  app.get(
    "/v1/inbox/stream",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      res.status(200);
      res.setHeader("content-type", "text/event-stream; charset=utf-8");
      res.setHeader("cache-control", "no-cache, no-transform");
      res.setHeader("connection", "keep-alive");
      res.setHeader("x-accel-buffering", "no");
      res.flushHeaders?.();
      res.write("retry: 10000\n\n");
      const unsubscribe = subscribe(user.id, (e) => {
        res.write(`event: ${e.type}\ndata: ${JSON.stringify({ conversationId: e.conversationId, messageId: e.messageId ?? null })}\n\n`);
      });
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      req.on("close", () => {
        clearInterval(ping);
        unsubscribe();
      });
    })
  );
}
