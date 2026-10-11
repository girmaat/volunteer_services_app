/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { canSendDirectMessage } from "../safety/permissions";
import type { Application, Request } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireOrg } from "./context";

export function registerOrgMessagesRoutes(app: Express) {

  // Phase 4.3: Org inbox (shared view over direct_messages scoped to org members)
  app.get(
    "/v1/org/messages/inbox",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const orgSlug = ok.ctx.org.slug;

            const rows = await pool.query(
        `
        WITH org_users AS (
          SELECT user_id
          FROM organization_members
          WHERE org_slug = $1 AND status='active' AND user_id IS NOT NULL
        ),
        relevant AS (
          SELECT d.*
          FROM direct_messages d
          WHERE d.sender_user_id IN (SELECT user_id FROM org_users)
             OR d.recipient_user_id IN (SELECT user_id FROM org_users)
        ),
        peers AS (
          SELECT
            CASE
              WHEN d.sender_user_id IN (SELECT user_id FROM org_users) THEN d.recipient_user_id
              ELSE d.sender_user_id
            END AS peer_id,
            d.request_id,
            d.application_id,
            MAX(d.created_at) AS last_at
          FROM relevant d
          GROUP BY 1, d.request_id, d.application_id
        )
        SELECT
          p.peer_id,
          p.request_id,
          p.application_id,
          r.title AS request_title,
          u.email AS peer_email,
          up.display_name AS peer_display_name,
          up.avatar_url AS peer_avatar_url,
          (SELECT body FROM relevant d2
            WHERE (
              (d2.sender_user_id IN (SELECT user_id FROM org_users) AND d2.recipient_user_id = p.peer_id)
              OR (d2.recipient_user_id IN (SELECT user_id FROM org_users) AND d2.sender_user_id = p.peer_id)
            )
            AND d2.request_id IS NOT DISTINCT FROM p.request_id
            AND d2.application_id IS NOT DISTINCT FROM p.application_id
            ORDER BY d2.created_at DESC
            LIMIT 1
          ) AS last_body,
          p.last_at,
          (SELECT COUNT(*)::int FROM relevant du
            WHERE du.sender_user_id = p.peer_id
              AND du.recipient_user_id IN (SELECT user_id FROM org_users)
              AND du.read_at IS NULL
              AND du.request_id IS NOT DISTINCT FROM p.request_id
              AND du.application_id IS NOT DISTINCT FROM p.application_id
          ) AS unread_count,
          (SELECT du.sender_user_id FROM relevant du
            WHERE (
              (du.sender_user_id IN (SELECT user_id FROM org_users) AND du.recipient_user_id = p.peer_id)
              OR (du.recipient_user_id IN (SELECT user_id FROM org_users) AND du.sender_user_id = p.peer_id)
            )
            AND du.request_id IS NOT DISTINCT FROM p.request_id
            AND du.application_id IS NOT DISTINCT FROM p.application_id
            ORDER BY du.created_at DESC
            LIMIT 1
          ) AS last_sender_user_id
        FROM peers p
        JOIN users u ON u.id = p.peer_id
        LEFT JOIN user_profiles up ON up.user_id = u.id
        LEFT JOIN service_requests r ON r.id = p.request_id
        ORDER BY p.last_at DESC
        `,
        [orgSlug]
      );

      return res.json({ threads: rows.rows });
    })
  );


  
app.get(
  "/v1/org/messages/thread/:peerId",
  wrap(async (req: any, res: any) => {
    const ok = await requireOrg(pool, req, res);
    if (!ok) return;

    const params = z.object({ peerId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return res.status(400).json({ message: "Invalid peer id" });

    const orgSlug = ok.ctx.org.slug;
    const peerId = params.data.peerId;

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
          a.request_id,
          a.volunteer_user_id,
          r.title AS request_title,
          r.requester_org_slug
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });
      const row = a.rows[0];

      if (String(row.requester_org_slug) !== orgSlug) {
        return res.status(403).json({ message: "You do not have access to this application." });
      }
      if (String(row.volunteer_user_id) !== peerId) {
        return res.status(403).json({ message: "Invalid application context for this peer." });
      }

      requestId = requestId ?? String(row.request_id);
      if (requestId !== String(row.request_id)) {
        return res.status(400).json({ message: "Context mismatch (application vs request)." });
      }

      context = {
        request_id: requestId,
        request_title: row.request_title,
        application_id: applicationId
      };
    }

    if (requestId && !context) {
      const r = await pool.query("SELECT id, title FROM service_requests WHERE id = $1 AND requester_org_slug = $2", [
        requestId,
        orgSlug
      ]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const okApp = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (okApp.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }

      context = { request_id: String(r.rows[0].id), request_title: r.rows[0].title, application_id: applicationId };
    }

    const msgs = await pool.query(
      `
      WITH org_users AS (
        SELECT user_id
        FROM organization_members
        WHERE org_slug = $1 AND status='active' AND user_id IS NOT NULL
      )
      SELECT
        d.id,
        d.sender_user_id,
        d.recipient_user_id,
        d.request_id,
        d.application_id,
        d.body,
        d.created_at,
        d.read_at,
        sp.full_name AS sender_full_name
      FROM direct_messages d
      LEFT JOIN user_profiles sp ON sp.user_id = d.sender_user_id
      WHERE
        (
          (d.sender_user_id IN (SELECT user_id FROM org_users) AND d.recipient_user_id = $2)
          OR
          (d.recipient_user_id IN (SELECT user_id FROM org_users) AND d.sender_user_id = $2)
        )
        AND d.request_id IS NOT DISTINCT FROM $3::uuid
        AND d.application_id IS NOT DISTINCT FROM $4::uuid
      ORDER BY d.created_at ASC
      `,
      [orgSlug, peerId, requestId, applicationId]
    );

    // Mark messages to *this* org member as read (per-recipient, context-scoped)
    await pool.query(
      `
      UPDATE direct_messages
      SET read_at = NOW()
      WHERE sender_user_id = $2::uuid
        AND recipient_user_id = $1::uuid
        AND read_at IS NULL
        AND request_id IS NOT DISTINCT FROM $3::uuid
        AND application_id IS NOT DISTINCT FROM $4::uuid
      `,
      [String((ok.user as any).id), peerId, requestId, applicationId]
    );

    return res.json({ context, messages: msgs.rows });
  })
);


app.post(
  "/v1/org/messages/thread/:peerId",
  wrap(async (req: any, res: any) => {
    const ok = await requireOrg(pool, req, res);
    if (!ok) return;

    const params = z.object({ peerId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return res.status(400).json({ message: "Invalid peer id" });

    const orgSlug = ok.ctx.org.slug;
    const peerId = params.data.peerId;

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
        SELECT a.request_id, a.volunteer_user_id, r.requester_org_slug
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });
      const row = a.rows[0];

      if (String(row.requester_org_slug) !== orgSlug) {
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
      const r = await pool.query("SELECT id FROM service_requests WHERE id = $1 AND requester_org_slug = $2", [requestId, orgSlug]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const okApp = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (okApp.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }
    }

    const schema = z.object({ body: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const perm = await canSendDirectMessage(ok.user, peerId);
    if (!perm.allowed) {
      return res.status(403).json({ message: perm.reason || "This user is not accepting direct messages." });
    }

    const insert = await pool.query(
      `
      INSERT INTO direct_messages (sender_user_id, recipient_user_id, request_id, application_id, body)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)
      RETURNING id, sender_user_id, recipient_user_id, body, created_at, read_at
      `,
      [String((ok.user as any).id), peerId, requestId, applicationId, parsed.data.body]
    );

    return res.status(201).json(insert.rows[0]);
  })
);
}
