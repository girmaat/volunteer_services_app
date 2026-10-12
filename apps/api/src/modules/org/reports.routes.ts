/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Organization reports (OPS-02, OPS-05), built on contributions so they agree with what volunteers
 * see: hours count once approved; hours waiting for a decision and hours not approved are reported
 * separately; units ("meals") are never added to hours. Per request: goal, promised (accepted
 * commitments), approved and waiting, in the request's own unit. Approval delay is the time from a
 * contribution being recorded to its first decision.
 *
 * Dates filter by when the work happened (start time, else when it was recorded). `to` includes
 * the whole day.
 */
import type { Express } from "express";
import { z } from "zod";
import { minorSql } from "../../lib/age";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireAdminOrManager, requireOrg } from "./context";

const CREDITED = "('approved', 'adjusted')";
const WAITING = "('pending', 'disputed', 'revision_requested')";
const DECLINED = "('rejected', 'unverified')";

/** A YYYY-MM-DD (or ISO) range; a date-only `to` covers that whole day. */
function range(query: unknown) {
  const q = z.object({ from: z.string().optional(), to: z.string().optional(), requestId: z.string().uuid().optional(), all: z.enum(["1", "true"]).optional() }).safeParse(query);
  const parse = (v: string | undefined, endOfDay: boolean) => {
    if (!v) return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  };
  return {
    from: q.success ? parse(q.data.from, false) : null,
    // Exclusive upper bound.
    to: q.success ? parse(q.data.to, true) : null,
    requestId: q.success && q.data.requestId ? q.data.requestId : null,
    // Exports ask for every row; screens show the top rows and say how many there are.
    all: q.success && Boolean(q.data.all)
  };
}

/** Practical ceiling for an "all rows" export. */
const EXPORT_MAX = 20_000;

const r2 = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;
const r1 = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);

/** Contributions of this organization in range: the CTE every report reads. */
const INRANGE = `
  WITH c AS (
    SELECT c.* FROM contributions c
     WHERE c.org_slug = $1
       AND ($2::timestamptz IS NULL OR COALESCE(c.started_at, c.created_at) >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR COALESCE(c.started_at, c.created_at) < $3::timestamptz)
       AND ($4::uuid IS NULL OR c.request_id = $4::uuid)
  )`;

export function registerOrgReportsRoutes(app: Express) {
  app.get(
    "/v1/org/reports/impact",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      // Reports name volunteers and their hours: admins and managers only.
      if (!requireAdminOrManager(ok.ctx, res)) return;
      const { from, to, requestId, all } = range(req.query);
      const params = [ok.ctx.org.slug, from, to, requestId];

      const [hours, units, delay, perRequest, requests, applications, attendance] = await Promise.all([
        pool.query(
          `${INRANGE}
           SELECT COALESCE(SUM(approved_hours) FILTER (WHERE status IN ${CREDITED}), 0)::float AS approved,
                  COALESCE(SUM(reported_hours) FILTER (WHERE status IN ${WAITING}), 0)::float AS waiting,
                  COALESCE(SUM(reported_hours) FILTER (WHERE status IN ${DECLINED}), 0)::float AS declined,
                  COALESCE(SUM(reported_hours) FILTER (WHERE status IN ${CREDITED}), 0)::float AS reported_of_approved,
                  COUNT(*) FILTER (WHERE status IN ${CREDITED})::int AS approved_entries,
                  COUNT(*) FILTER (WHERE status IN ${WAITING})::int AS waiting_entries,
                  COUNT(*) FILTER (WHERE status IN ${DECLINED})::int AS declined_entries,
                  COUNT(*) FILTER (WHERE status = 'adjusted')::int AS adjusted_entries,
                  COUNT(DISTINCT volunteer_user_id) FILTER (WHERE status IN ${CREDITED})::int AS volunteers,
                  MIN(created_at) FILTER (WHERE status IN ${WAITING}) AS oldest_waiting_at
             FROM c`,
          params
        ),
        pool.query(
          `${INRANGE}
           SELECT unit, COALESCE(SUM(approved_units) FILTER (WHERE status IN ${CREDITED}), 0)::float AS approved,
                  COALESCE(SUM(reported_units) FILTER (WHERE status IN ${WAITING}), 0)::float AS waiting
             FROM c WHERE unit IS NOT NULL GROUP BY unit ORDER BY unit`,
          params
        ),
        pool.query(
          `${INRANGE}
           , first_decision AS (
             SELECT c.id, c.created_at, MIN(d.created_at) AS decided_at
               FROM c JOIN contribution_decisions d ON d.contribution_id = c.id
                AND d.action IN ('approved', 'adjusted', 'rejected', 'revision_requested')
              GROUP BY c.id, c.created_at)
           SELECT COUNT(*)::int AS decided,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - created_at)) / 3600.0) AS median_hours,
                  AVG(EXTRACT(EPOCH FROM (decided_at - created_at)) / 3600.0) AS average_hours
             FROM first_decision`,
          params
        ),
        pool.query(
          `${INRANGE}
           SELECT r.id AS request_id, r.title AS request_title, r.status, r.target_value::float AS target, r.target_unit AS unit,
                  (SELECT COALESCE(SUM(COALESCE(a.accepted_amount, a.offered_amount)), 0)::float FROM request_applications a
                    WHERE a.request_id = r.id AND a.status IN ('accepted', 'confirmed', 'completed')) AS promised,
                  (SELECT COUNT(*)::int FROM request_applications a WHERE a.request_id = r.id AND a.status IN ('accepted', 'confirmed', 'completed')) AS volunteers_accepted,
                  COALESCE(SUM(c.approved_hours) FILTER (WHERE c.status IN ${CREDITED}), 0)::float AS approved_hours,
                  COALESCE(SUM(c.reported_hours) FILTER (WHERE c.status IN ${WAITING}), 0)::float AS waiting_hours,
                  COALESCE(SUM(c.approved_units) FILTER (WHERE c.status IN ${CREDITED}), 0)::float AS approved_units,
                  COALESCE(SUM(c.reported_units) FILTER (WHERE c.status IN ${WAITING}), 0)::float AS waiting_units,
                  COUNT(DISTINCT c.volunteer_user_id) FILTER (WHERE c.status IN ${CREDITED})::int AS volunteers_approved,
                  COUNT(*) OVER ()::int AS total_rows
             FROM service_requests r
             LEFT JOIN c ON c.request_id = r.id
            WHERE r.requester_org_slug = $1 AND ($4::uuid IS NULL OR r.id = $4::uuid)
              AND (c.id IS NOT NULL OR (r.target_value IS NOT NULL AND r.status IN ('open', 'pending', 'filled', 'paused')))
            GROUP BY r.id
            ORDER BY approved_hours DESC, waiting_hours DESC, r.title
            LIMIT $5`,
          [...params, all ? EXPORT_MAX : 100]
        ),
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE published_at IS NOT NULL)::int AS published,
                  COUNT(*) FILTER (WHERE status IN ('open', 'pending'))::int AS open,
                  COUNT(*) FILTER (WHERE status = 'filled')::int AS filled,
                  COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
                  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                  COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
             FROM service_requests
            WHERE requester_org_slug = $1
              AND ($2::timestamptz IS NULL OR COALESCE(published_at, created_at) >= $2::timestamptz)
              AND ($3::timestamptz IS NULL OR COALESCE(published_at, created_at) < $3::timestamptz)
              AND ($4::uuid IS NULL OR id = $4::uuid)`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE a.status IN ('pending', 'waitlisted', 'offered'))::int AS waiting,
                  COUNT(*) FILTER (WHERE a.status IN ('accepted', 'confirmed', 'completed'))::int AS accepted,
                  COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
                  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM org_attendance_logs l WHERE l.request_application_id = a.id))::int AS attended,
                  COUNT(*) FILTER (WHERE a.status IN ('rejected', 'withdrawn', 'canceled', 'offer_expired'))::int AS closed
             FROM request_applications a JOIN service_requests r ON r.id = a.request_id
            WHERE r.requester_org_slug = $1
              AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
              AND ($3::timestamptz IS NULL OR a.created_at < $3::timestamptz)
              AND ($4::uuid IS NULL OR r.id = $4::uuid)`,
          params
        ),
        pool.query("SELECT COUNT(*)::int AS open_checkins FROM org_attendance_logs WHERE org_slug = $1 AND check_out_at IS NULL", [ok.ctx.org.slug])
      ]);

      const h = hours.rows[0] ?? {};
      const d = delay.rows[0] ?? {};
      return res.json({
        range: { from, to, request_id: requestId },
        hours: {
          approved: r2(h.approved),
          waiting: r2(h.waiting),
          declined: r2(h.declined),
          reported_of_approved: r2(h.reported_of_approved),
          approved_entries: Number(h.approved_entries || 0),
          waiting_entries: Number(h.waiting_entries || 0),
          declined_entries: Number(h.declined_entries || 0),
          adjusted_entries: Number(h.adjusted_entries || 0),
          volunteers: Number(h.volunteers || 0),
          oldest_waiting_at: h.oldest_waiting_at ?? null
        },
        units: units.rows.map((u) => ({ unit: u.unit, approved: r2(u.approved), waiting: r2(u.waiting) })),
        approval_delay: { decided: Number(d.decided || 0), median_hours: r1(d.median_hours), average_hours: r1(d.average_hours) },
        requests: requests.rows[0],
        applications: applications.rows[0],
        open_checkins: Number(attendance.rows[0]?.open_checkins || 0),
        per_request_total: perRequest.rows.length ? Number(perRequest.rows[0].total_rows) : 0,
        per_request: perRequest.rows.map((r) => {
          const inHours = !r.unit || r.unit === "hours";
          const approved = inHours ? r2(r.approved_hours) : r2(r.approved_units);
          return {
            request_id: r.request_id,
            request_title: r.request_title,
            status: r.status,
            target: r.target,
            unit: r.unit ?? null,
            promised: r.target != null ? r2(r.promised) : null,
            approved_in_unit: r.target != null ? approved : null,
            waiting_in_unit: r.target != null ? (inHours ? r2(r.waiting_hours) : r2(r.waiting_units)) : null,
            approved_hours: r2(r.approved_hours),
            waiting_hours: r2(r.waiting_hours),
            volunteers_accepted: Number(r.volunteers_accepted || 0),
            volunteers_approved: Number(r.volunteers_approved || 0)
          };
        })
      });
    })
  );

  app.get(
    "/v1/org/reports/volunteer-hours",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;
      const { from, to, requestId, all } = range(req.query);
      const rows = await pool.query(
        `${INRANGE}
         SELECT c.volunteer_user_id,
                CASE WHEN ${minorSql("c.volunteer_user_id")} THEN NULL ELSE u.email END AS volunteer_email,
                COALESCE(NULLIF(up.display_name, ''), split_part(COALESCE(up.full_name, ''), ' ', 1)) AS volunteer_display_name,
                ${minorSql("c.volunteer_user_id")} AS minor,
                COALESCE(SUM(c.approved_hours) FILTER (WHERE c.status IN ${CREDITED}), 0)::float AS approved_hours,
                COALESCE(SUM(c.reported_hours) FILTER (WHERE c.status IN ${WAITING}), 0)::float AS waiting_hours,
                COALESCE(SUM(c.reported_hours) FILTER (WHERE c.status IN ${DECLINED}), 0)::float AS declined_hours,
                COUNT(*) FILTER (WHERE c.status IN ${CREDITED})::int AS approved_entries,
                COUNT(*) FILTER (WHERE c.status IN ${WAITING})::int AS waiting_entries,
                MAX(COALESCE(c.ended_at, c.started_at, c.created_at)) AS last_activity_at,
                COUNT(*) OVER ()::int AS total_rows,
                SUM(COALESCE(SUM(c.approved_hours) FILTER (WHERE c.status IN ${CREDITED}), 0)) OVER ()::float AS all_approved,
                SUM(COALESCE(SUM(c.reported_hours) FILTER (WHERE c.status IN ${WAITING}), 0)) OVER ()::float AS all_waiting
           FROM c
           LEFT JOIN users u ON u.id = c.volunteer_user_id
           LEFT JOIN user_profiles up ON up.user_id = c.volunteer_user_id
          GROUP BY c.volunteer_user_id, u.email, up.display_name, up.full_name
          ORDER BY approved_hours DESC, waiting_hours DESC, last_activity_at DESC NULLS LAST
          LIMIT $5`,
        [ok.ctx.org.slug, from, to, requestId, all ? EXPORT_MAX : 500]
      );
      // Totals cover every volunteer, not only the rows returned.
      const first = rows.rows[0] ?? {};
      return res.json({
        range: { from, to },
        request_id: requestId,
        // `total_hours` is approved hours (kept for older callers).
        total_hours: r2(first.all_approved),
        approved_hours: r2(first.all_approved),
        waiting_hours: r2(first.all_waiting),
        volunteers_total: Number(first.total_rows || 0),
        volunteers: rows.rows.map(({ total_rows: _t, all_approved: _a, all_waiting: _w, ...r }: any) => ({ ...r, approved_hours: r2(r.approved_hours), waiting_hours: r2(r.waiting_hours), declined_hours: r2(r.declined_hours) }))
      });
    })
  );
}
