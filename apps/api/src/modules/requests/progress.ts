import { pool } from "../../lib/db";
import { staffingCounts } from "./lifecycle";

/**
 * A request's measures, kept separate (REQ-06, scenario "40-hour tutoring request"):
 * target, accepted commitments, reported (waiting) and approved amounts, in the target unit.
 * Hours and other units are never added together, and goods never become hours.
 */
export async function requestProgress(requestId: string) {
  const s = await staffingCounts(pool, requestId);
  const unitIsHours = !s.unit || s.unit === "hours";
  const r = await pool.query(
    `SELECT COALESCE(SUM(approved_hours) FILTER (WHERE status IN ('approved', 'adjusted')), 0)::float AS approved_hours,
            COALESCE(SUM(reported_hours) FILTER (WHERE status IN ('pending', 'disputed', 'revision_requested')), 0)::float AS reported_hours,
            COALESCE(SUM(approved_units) FILTER (WHERE status IN ('approved', 'adjusted')), 0)::float AS approved_units,
            COALESCE(SUM(reported_units) FILTER (WHERE status IN ('pending', 'disputed', 'revision_requested')), 0)::float AS reported_units
       FROM contributions WHERE request_id = $1`,
    [requestId]
  );
  const t = r.rows[0];
  const approved = unitIsHours ? Number(t.approved_hours) : Number(t.approved_units);
  const reported = unitIsHours ? Number(t.reported_hours) : Number(t.reported_units);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    committed: r2(s.committed),
    approved: r2(approved),
    waiting_approval: r2(reported),
    approved_hours: r2(Number(t.approved_hours)),
    open_capacity: s.target == null ? null : Math.max(0, r2(s.target - s.committed)),
    // Committed but not yet approved (the scenario's "13 committed hours await approval or completion").
    committed_not_approved: s.target == null ? null : Math.max(0, r2(s.committed - approved))
  };
}
