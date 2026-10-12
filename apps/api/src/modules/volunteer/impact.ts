import { pool } from "../../lib/db";
import { METHOD_LABEL, type Method } from "../contributions/service";

/**
 * A volunteer's service, split the way the requirements ask (REC-01): hours a reviewer approved,
 * hours waiting for a decision, and self-reported hours nobody here confirmed. They are never added
 * together, and units ("meals", "items") stay separate from hours.
 */

export type WorkContribution = {
  id: string;
  status: string;
  source: string;
  method_label: string;
  started_at: string | null;
  ended_at: string | null;
  reported_hours: number | null;
  approved_hours: number | null;
  reported_units: number | null;
  approved_units: number | null;
  unit: string | null;
  description: string | null;
  last_reason: string | null;
  decided_by_role: string | null;
};

export type CompletedWork = {
  application_id: string;
  request_id: string;
  title: string;
  organization_name: string | null;
  requester_name: string | null;
  requester_user_id: string | null;
  org_slug: string | null;
  application_status: string;
  completed_at: string;
  /** Approved hours for this engagement. */
  hours: number;
  /** Hours reported and waiting for a decision. */
  pending_hours: number;
  contributions: WorkContribution[];
};

const CREDITED = new Set(["approved", "adjusted"]);
const WAITING = new Set(["pending", "disputed", "revision_requested"]);
const num = (v: unknown) => (v == null ? null : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Every engagement that was completed or has hours recorded, newest first, with its contributions. */
export async function completedWork(userId: string): Promise<CompletedWork[]> {
  const apps = await pool.query(
    `SELECT a.id AS application_id, a.status AS application_status, r.id AS request_id, r.title, o.name AS organization_name, r.requester_org_slug AS org_slug,
            CASE WHEN r.requester_org_slug IS NULL THEN COALESCE(NULLIF(p.display_name, ''), split_part(COALESCE(p.full_name, ''), ' ', 1)) END AS requester_name,
            CASE WHEN r.requester_org_slug IS NULL THEN r.requester_user_id END AS requester_user_id,
            COALESCE(a.completed_at, (SELECT MAX(COALESCE(c.ended_at, c.created_at)) FROM contributions c WHERE c.application_id = a.id), a.updated_at) AS completed_at
       FROM request_applications a
       JOIN service_requests r ON r.id = a.request_id
       LEFT JOIN organizations o ON o.slug = r.requester_org_slug
       LEFT JOIN user_profiles p ON p.user_id = r.requester_user_id
      WHERE a.volunteer_user_id = $1
        AND (a.status = 'completed' OR EXISTS (SELECT 1 FROM contributions c WHERE c.application_id = a.id))
      ORDER BY completed_at DESC`,
    [userId]
  );
  const contribs = await pool.query(
    `SELECT c.id, c.application_id, c.status, c.source, c.verification_method, c.started_at, c.ended_at, c.reported_hours, c.approved_hours,
            c.reported_units, c.approved_units, c.unit, c.description, c.decided_by_role,
            (SELECT d.reason FROM contribution_decisions d WHERE d.contribution_id = c.id AND d.action IN ('adjusted', 'rejected', 'revision_requested', 'corrected', 'marked_unverified')
              ORDER BY d.created_at DESC LIMIT 1) AS last_reason
       FROM contributions c WHERE c.volunteer_user_id = $1 AND c.application_id IS NOT NULL
      ORDER BY COALESCE(c.started_at, c.created_at)`,
    [userId]
  );
  const byApp = new Map<string, WorkContribution[]>();
  for (const c of contribs.rows) {
    const k = String(c.application_id);
    byApp.set(k, [
      ...(byApp.get(k) ?? []),
      {
        id: String(c.id),
        status: c.status,
        source: c.source,
        method_label: METHOD_LABEL[c.verification_method as Method],
        started_at: c.started_at ? new Date(c.started_at).toISOString() : null,
        ended_at: c.ended_at ? new Date(c.ended_at).toISOString() : null,
        reported_hours: num(c.reported_hours),
        approved_hours: num(c.approved_hours),
        reported_units: num(c.reported_units),
        approved_units: num(c.approved_units),
        unit: c.unit ?? null,
        description: c.description ?? null,
        last_reason: c.last_reason ?? null,
        decided_by_role: c.decided_by_role ?? null
      }
    ]);
  }
  return apps.rows.map((row) => {
    const cs = byApp.get(String(row.application_id)) ?? [];
    return {
      application_id: String(row.application_id),
      request_id: String(row.request_id),
      title: String(row.title),
      organization_name: row.organization_name ?? null,
      requester_name: row.requester_name || null,
      requester_user_id: row.requester_user_id ?? null,
      org_slug: row.org_slug ?? null,
      application_status: String(row.application_status),
      completed_at: new Date(row.completed_at).toISOString(),
      hours: r2(cs.filter((c) => CREDITED.has(c.status)).reduce((n, c) => n + (c.approved_hours ?? 0), 0)),
      pending_hours: r2(cs.filter((c) => WAITING.has(c.status)).reduce((n, c) => n + (c.reported_hours ?? 0), 0)),
      contributions: cs
    };
  });
}

export type HoursSummary = {
  /** Approved by an organization reviewer or the person helped. */
  approved: number;
  /** Reported and waiting for a decision (or a dispute). */
  pending: number;
  /** Logged by the volunteer with nothing here to confirm it. */
  self_reported: number;
  /** Units other than hours, approved, per unit. */
  units: { unit: string; approved: number; pending: number }[];
};

export async function hoursSummary(userId: string): Promise<HoursSummary> {
  const r = await pool.query(
    `SELECT status, unit, COALESCE(SUM(approved_hours), 0)::float AS approved_h, COALESCE(SUM(reported_hours), 0)::float AS reported_h,
            COALESCE(SUM(approved_units), 0)::float AS approved_u, COALESCE(SUM(reported_units), 0)::float AS reported_u
       FROM contributions WHERE volunteer_user_id = $1 GROUP BY status, unit`,
    [userId]
  );
  // Notes and hours logged before contributions existed count as self-reported.
  const legacy = await pool.query(
    `SELECT (COALESCE((SELECT SUM(hours) FROM volunteer_impact_entries WHERE volunteer_user_id = $1), 0)
           + COALESCE((SELECT SUM(duration_hours) FROM volunteer_task_entries WHERE volunteer_user_id = $1), 0))::float AS h`,
    [userId]
  );
  const out: HoursSummary = { approved: 0, pending: 0, self_reported: Number(legacy.rows[0]?.h || 0), units: [] };
  const units = new Map<string, { approved: number; pending: number }>();
  for (const row of r.rows) {
    if (CREDITED.has(row.status)) out.approved += row.approved_h;
    else if (WAITING.has(row.status)) out.pending += row.reported_h;
    else if (row.status === "self_reported") out.self_reported += row.reported_h;
    if (row.unit) {
      const u = units.get(row.unit) ?? { approved: 0, pending: 0 };
      if (CREDITED.has(row.status)) u.approved += row.approved_u;
      else if (WAITING.has(row.status)) u.pending += row.reported_u;
      units.set(row.unit, u);
    }
  }
  out.approved = r2(out.approved);
  out.pending = r2(out.pending);
  out.self_reported = r2(out.self_reported);
  out.units = [...units.entries()].map(([unit, v]) => ({ unit, approved: r2(v.approved), pending: r2(v.pending) }));
  return out;
}

/** Approved hours and the work behind them (summary, badges). */
export async function totalHours(userId: string) {
  const [work, summary] = await Promise.all([completedWork(userId), hoursSummary(userId)]);
  return { work, hours: summary.approved, summary };
}
