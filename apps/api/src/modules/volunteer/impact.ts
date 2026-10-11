import { pool } from "../../lib/db";

export type CompletedWork = {
  application_id: string;
  request_id: string;
  title: string;
  organization_name: string | null;
  requester_name: string | null;
  requester_user_id: string | null;
  org_slug: string | null;
  completed_at: string;
  /** Hours credited: what they logged for it, else the commitment's length, else the request's duration, else 1. */
  hours: number;
  /** True when the hours come from the schedule rather than from the volunteer's own log. */
  auto_hours: boolean;
};

/** Every completed engagement with the hours it counts for (one query; used by Impact, summary, badges, CSV). */
export async function completedWork(userId: string): Promise<CompletedWork[]> {
  const r = await pool.query(
    `SELECT a.id AS application_id, r.id AS request_id, r.title, o.name AS organization_name, r.requester_org_slug AS org_slug,
            CASE WHEN r.requester_org_slug IS NULL THEN COALESCE(NULLIF(p.display_name, ''), split_part(COALESCE(p.full_name, ''), ' ', 1)) END AS requester_name,
            CASE WHEN r.requester_org_slug IS NULL THEN r.requester_user_id END AS requester_user_id,
            COALESCE(a.completed_at, a.updated_at) AS completed_at,
            ROUND(COALESCE(EXTRACT(EPOCH FROM (c.end_at - c.start_at)) / 3600, r.duration_minutes / 60.0, 1)::numeric, 2)::float AS scheduled_hours,
            COALESCE((SELECT SUM(i.hours) FROM volunteer_impact_entries i WHERE i.volunteer_user_id = $1 AND i.request_id = r.id), 0)
              + COALESCE((SELECT SUM(t.duration_hours) FROM volunteer_task_entries t WHERE t.volunteer_user_id = $1 AND t.request_id = r.id), 0) AS logged_hours
       FROM request_applications a
       JOIN service_requests r ON r.id = a.request_id
       LEFT JOIN organizations o ON o.slug = r.requester_org_slug
       LEFT JOIN user_profiles p ON p.user_id = r.requester_user_id
       LEFT JOIN LATERAL (SELECT start_at, end_at FROM request_commitments c
                           WHERE c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id AND c.end_at IS NOT NULL
                           ORDER BY c.updated_at DESC LIMIT 1) c ON TRUE
      WHERE a.volunteer_user_id = $1 AND a.status = 'completed'
      ORDER BY COALESCE(a.completed_at, a.updated_at) DESC`,
    [userId]
  );
  return r.rows.map((row) => {
    const logged = Number(row.logged_hours || 0);
    return {
      application_id: String(row.application_id),
      request_id: String(row.request_id),
      title: String(row.title),
      organization_name: row.organization_name ?? null,
      requester_name: row.requester_name || null,
      requester_user_id: row.requester_user_id ?? null,
      org_slug: row.org_slug ?? null,
      completed_at: new Date(row.completed_at).toISOString(),
      hours: logged > 0 ? logged : Number(row.scheduled_hours || 0),
      auto_hours: !(logged > 0)
    };
  });
}

/** Hours logged against no completed engagement (free-form impact or task entries). */
export async function unattachedHours(userId: string, completedRequestIds: string[]) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(h), 0)::float AS hours FROM (
       SELECT hours AS h, request_id FROM volunteer_impact_entries WHERE volunteer_user_id = $1
       UNION ALL
       SELECT duration_hours, request_id FROM volunteer_task_entries WHERE volunteer_user_id = $1
     ) x WHERE request_id IS NULL OR NOT (request_id = ANY($2::uuid[]))`,
    [userId, completedRequestIds]
  );
  return Number(r.rows[0]?.hours || 0);
}

/** Total hours: completed engagements (logged or scheduled) plus hours logged for anything else. */
export async function totalHours(userId: string) {
  const work = await completedWork(userId);
  const extra = await unattachedHours(userId, work.map((w) => w.request_id));
  return { work, hours: Math.round((work.reduce((n, w) => n + w.hours, 0) + extra) * 100) / 100 };
}
