/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireOrg } from "./context";

export function registerOrgReportsRoutes(app: Express) {

  // Phase 4.4: Reporting (impact/outcomes + volunteer hours summary)
  app.get(
    "/v1/org/reports/impact",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          from: z.string().optional(),
          to: z.string().optional()
        })
        .safeParse(req.query);

      const from = q.success && q.data.from ? new Date(String(q.data.from)) : null;
      const to = q.success && q.data.to ? new Date(String(q.data.to)) : null;

      const fromIso = from && !Number.isNaN(from.getTime()) ? from.toISOString() : null;
      const toIso = to && !Number.isNaN(to.getTime()) ? to.toISOString() : null;

      const [reqCounts, appCounts, attendanceCounts, topRequests, completedApps] = await Promise.all([
        pool.query(
          `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'open')::int AS open,
            COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
            COUNT(*) FILTER (WHERE status = 'closed')::int AS closed
          FROM service_requests
          WHERE requester_org_slug = $1
            AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE a.status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE a.status = 'accepted')::int AS accepted,
            COUNT(*) FILTER (WHERE a.status = 'waitlisted')::int AS waitlisted,
            COUNT(*) FILTER (WHERE a.status = 'rejected')::int AS rejected,
            COUNT(*) FILTER (WHERE a.status = 'withdrawn')::int AS withdrawn,
            COUNT(*) FILTER (WHERE a.status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_org_slug = $1
            AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR a.created_at <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT
            COUNT(*) FILTER (WHERE check_out_at IS NULL)::int AS open_sessions,
            COUNT(*) FILTER (WHERE check_out_at IS NOT NULL)::int AS closed_sessions,
            ROUND(COALESCE(SUM(COALESCE(hours, 0)), 0)::numeric, 2) AS total_hours,
            COUNT(DISTINCT volunteer_user_id)::int AS unique_volunteers
          FROM org_attendance_logs
          WHERE org_slug = $1
            AND ($2::timestamptz IS NULL OR check_in_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR check_in_at <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT
            r.id AS request_id,
            r.title AS request_title,
            ROUND(COALESCE(SUM(COALESCE(l.hours, 0)), 0)::numeric, 2) AS total_hours,
            COUNT(*)::int AS sessions
          FROM org_attendance_logs l
          JOIN service_requests r ON r.id = l.request_id
          WHERE l.org_slug = $1
            AND ($2::timestamptz IS NULL OR l.check_in_at >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR l.check_in_at <= $3::timestamptz)
          GROUP BY r.id, r.title
          ORDER BY total_hours DESC NULLS LAST, sessions DESC
          LIMIT 10
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        ),
        pool.query(
          `
          SELECT COUNT(*)::int AS completed_engagements
          FROM request_applications a
          JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_org_slug = $1
            AND a.status = 'completed'
            AND ($2::timestamptz IS NULL OR COALESCE(a.status_updated_at, a.updated_at) >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR COALESCE(a.status_updated_at, a.updated_at) <= $3::timestamptz)
          `,
          [ok.ctx.org.slug, fromIso, toIso]
        )
      ]);

      const requests = reqCounts.rows?.[0] || {};
      const applications = appCounts.rows?.[0] || {};
      const attendance = attendanceCounts.rows?.[0] || {};
      const completedEngagements = Number(completedApps.rows?.[0]?.completed_engagements || 0);

      return res.json({
        range: { from: fromIso, to: toIso },
        requests: {
          total: Number(requests.total || 0),
          open: Number(requests.open || 0),
          paused: Number(requests.paused || 0),
          closed: Number(requests.closed || 0)
        },
        applications: {
          total: Number(applications.total || 0),
          pending: Number(applications.pending || 0),
          accepted: Number(applications.accepted || 0),
          waitlisted: Number(applications.waitlisted || 0),
          rejected: Number(applications.rejected || 0),
          withdrawn: Number(applications.withdrawn || 0),
          confirmed: Number(applications.confirmed || 0),
          completed: Number(applications.completed || 0)
        },
        outcomes: {
          completed_engagements: completedEngagements,
          unique_volunteers: Number(attendance.unique_volunteers || 0),
          open_checkins: Number(attendance.open_sessions || 0),
          closed_sessions: Number(attendance.closed_sessions || 0),
          total_hours: Number(attendance.total_hours || 0)
        },
        top_opportunities_by_hours: topRequests.rows || []
      });
    })
  );


  app.get(
    "/v1/org/reports/volunteer-hours",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const q = z
        .object({
          requestId: z.string().uuid().optional(),
          from: z.string().optional(),
          to: z.string().optional()
        })
        .safeParse(req.query);

      const requestId = q.success && q.data.requestId ? String(q.data.requestId) : null;
      const from = q.success && q.data.from ? new Date(String(q.data.from)) : null;
      const to = q.success && q.data.to ? new Date(String(q.data.to)) : null;

      const fromIso = from && !Number.isNaN(from.getTime()) ? from.toISOString() : null;
      const toIso = to && !Number.isNaN(to.getTime()) ? to.toISOString() : null;

      const rows = await pool.query(
        `
        SELECT
          l.volunteer_user_id,
          u.email AS volunteer_email,
          up.display_name AS volunteer_display_name,
          COUNT(*) FILTER (WHERE l.check_out_at IS NULL)::int AS open_sessions,
          COUNT(*) FILTER (WHERE l.check_out_at IS NOT NULL)::int AS closed_sessions,
          ROUND(COALESCE(SUM(COALESCE(l.hours, 0)), 0)::numeric, 2) AS total_hours,
          MAX(COALESCE(l.check_out_at, l.check_in_at)) AS last_activity_at
        FROM org_attendance_logs l
        LEFT JOIN users u ON u.id = l.volunteer_user_id
        LEFT JOIN user_profiles up ON up.user_id = l.volunteer_user_id
        WHERE l.org_slug = $1
          AND ($2::uuid IS NULL OR l.request_id = $2::uuid)
          AND ($3::timestamptz IS NULL OR l.check_in_at >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR l.check_in_at <= $4::timestamptz)
        GROUP BY l.volunteer_user_id, u.email, up.display_name
        ORDER BY total_hours DESC NULLS LAST, last_activity_at DESC NULLS LAST, volunteer_email ASC
        LIMIT 500
        `,
        [ok.ctx.org.slug, requestId, fromIso, toIso]
      );

      const total = rows.rows.reduce((s: number, r: any) => s + Number(r.total_hours || 0), 0);

      return res.json({
        range: { from: fromIso, to: toIso },
        request_id: requestId,
        total_hours: Math.round(total * 100) / 100,
        volunteers: rows.rows
      });
    })
  );
}
