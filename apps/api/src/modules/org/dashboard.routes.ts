/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { requireUserBySession } from "../../auth/session";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { authHeaderToken, getOrgContextForUser, requireOrg } from "./context";

export function registerOrgDashboardRoutes(app: Express) {
  // Phase 1+2: Org context (single org by membership; no switching)
  app.get(
    "/v1/org/me",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      return res.json(ok.ctx);
    })
  );



    app.get(
    "/v1/org/dashboard",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const orgSlug = ok.ctx.org.slug;

      const [openReq, pendingApps, members, unread, recentReq, recentApps] = await Promise.all([
        pool.query(
          "SELECT COUNT(*)::int AS c FROM service_requests WHERE requester_org_slug = $1 AND status IN ('open','pending','filled','paused')",
          [orgSlug]
        ),
        pool.query(
          `
          SELECT COUNT(*)::int AS c
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_org_slug = $1 AND a.status IN ('pending','waitlisted')
          `,
          [orgSlug]
        ),
        pool.query("SELECT COUNT(*)::int AS c FROM organization_members WHERE org_slug=$1 AND status='active'", [orgSlug]),
        pool.query(
          `
          SELECT COUNT(*)::int AS c
          FROM direct_messages d
          JOIN conversations c ON c.id = d.conversation_id
          WHERE c.org_slug = $1 AND d.sender_user_id = c.volunteer_user_id
          AND d.read_at IS NULL AND d.status = 'sent'
          `,
          [orgSlug]
        ),
        pool.query(
          `
          WITH apps AS (
            SELECT
              a.request_id,
              COUNT(*)::int AS applications_total,
              COUNT(*) FILTER (WHERE a.status = 'pending')::int AS applications_pending
            FROM request_applications a
            GROUP BY a.request_id
          )
          SELECT
            r.id,
            r.title,
            r.status,
            r.updated_at,
            COALESCE(apps.applications_total, 0)::int AS applications_total,
            COALESCE(apps.applications_pending, 0)::int AS applications_pending
          FROM service_requests r
          LEFT JOIN apps ON apps.request_id = r.id
          WHERE r.requester_org_slug=$1
          ORDER BY r.updated_at DESC
          LIMIT 6
          `,
          [orgSlug]
        ),
        pool.query(
          `
          SELECT
            a.id AS application_id,
            a.status,
            a.updated_at,
            r.id AS request_id,
            r.title AS request_title,
            v.id AS volunteer_user_id,
            CASE WHEN a.status IN ('accepted','confirmed','completed') THEN v.email END AS volunteer_email,
            vp.display_name AS volunteer_display_name,
            COALESCE(vp.public_location, vp.location) AS volunteer_public_location
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          JOIN users v ON v.id = a.volunteer_user_id
          LEFT JOIN user_profiles vp ON vp.user_id = v.id
          WHERE r.requester_org_slug = $1
          ORDER BY a.updated_at DESC
          LIMIT 6
          `,
          [orgSlug]
        )
      ]);

      // Hours waiting for a decision, and coordinators' requests waiting for an owner.
      const extra = await pool.query(
        `SELECT (SELECT COUNT(*)::int FROM contributions WHERE org_slug = $1 AND status IN ('pending', 'disputed')) AS hours_waiting,
                (SELECT COUNT(*)::int FROM service_requests WHERE requester_org_slug = $1 AND owner_approval = 'pending') AS owner_waiting`,
        [orgSlug]
      );
      return res.json({
        org: ok.ctx.org,
        hoursWaiting: Number(extra.rows[0]?.hours_waiting ?? 0),
        ownerApprovalsWaiting: Number(extra.rows[0]?.owner_waiting ?? 0),
        openRequests: Number(openReq.rows[0]?.c ?? 0),
        pendingApplications: Number(pendingApps.rows[0]?.c ?? 0),
        unreadMessages: Number(unread.rows[0]?.c ?? 0),
        activeMembers: Number(members.rows[0]?.c ?? 0),
        recentRequests: recentReq.rows,
        recentApplications: recentApps.rows
      });
    })
  );
}
