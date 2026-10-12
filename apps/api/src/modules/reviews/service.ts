/**
 * Reviews (Phase 4.7): structured, double-blind, and locked once published; reliability from
 * late cancellations and no-shows; disputes either side can open.
 */
import { calendarChanged } from "../calendar/updates";
import { pool } from "../../lib/db";
import { orgMembership, type PolicyUser } from "../../lib/policy";

export const REVIEW_WINDOW_DAYS = 14;

export type ReviewInput = {
  overall: number;
  reliability?: number | null;
  communication?: number | null;
  /** volunteer → requester: were instructions clear */
  clarity?: number | null;
  /** requester → volunteer: skill for the task */
  skill?: number | null;
  comment?: string | null;
  wouldWorkAgain?: boolean | null;
  /** legacy free-text fields */
  strengths?: string | null;
  improvements?: string | null;
};

type AppRow = {
  id: string;
  status: string;
  request_id: string;
  volunteer_user_id: string;
  requester_user_id: string;
  requester_org_slug: string | null;
  completed_at: string | null;
};

export class ReviewError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function loadApplication(id: string): Promise<AppRow | null> {
  const r = await pool.query(
    `SELECT a.id, a.status, a.request_id, a.volunteer_user_id, a.completed_at, r.requester_user_id, r.requester_org_slug
       FROM request_applications a JOIN service_requests r ON r.id = a.request_id WHERE a.id = $1`,
    [id]
  );
  return (r.rows[0] as AppRow) ?? null;
}

/** "volunteer" if the user did the work, "owner" if they posted it (or manage the posting org). */
export function sideFor(user: PolicyUser, a: AppRow): "volunteer" | "owner" | null {
  if (a.volunteer_user_id === user.id) return "volunteer";
  if (a.requester_user_id === user.id) return "owner";
  if (a.requester_org_slug) {
    const m = orgMembership(user, a.requester_org_slug);
    if (m && (m.role === "admin" || m.role === "manager")) return "owner";
  }
  return null;
}

/** Saves the caller's review. Both reviews become visible together when the second one arrives. */
export async function submitReview(user: PolicyUser, applicationId: string, input: ReviewInput) {
  const a = await loadApplication(applicationId);
  const side = a ? sideFor(user, a) : null;
  if (!a || !side) throw new ReviewError(404, "not_found", "Application not found");
  if (a.status !== "completed") throw new ReviewError(409, "not_completed", "Reviews open once the work is marked completed.");

  const table = side === "owner" ? "volunteer_reviews" : "requester_reviews";
  const subject = side === "owner" ? a.volunteer_user_id : a.requester_user_id;
  const subjectCol = side === "owner" ? "volunteer_user_id" : "requester_user_id";
  const specific = side === "owner" ? "skill" : "clarity";

  const existing = await pool.query(`SELECT id, visible_at FROM ${table} WHERE request_application_id = $1`, [applicationId]);
  if (existing.rows[0]?.visible_at) throw new ReviewError(409, "published", "Published reviews can't be changed. Open a dispute if something is wrong.");

  const past = a.completed_at && Date.now() - new Date(a.completed_at).getTime() > REVIEW_WINDOW_DAYS * 86400_000;
  const ins = await pool.query(
    `INSERT INTO ${table} (${subjectCol}, reviewer_user_id, request_application_id, request_id, rating, reliability, communication, ${specific},
                           comment, strengths, improvements, would_work_again, visible_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $13::boolean THEN NOW() ELSE NULL END)
     ON CONFLICT (request_application_id) WHERE request_application_id IS NOT NULL
     DO UPDATE SET rating = EXCLUDED.rating, reliability = EXCLUDED.reliability, communication = EXCLUDED.communication,
                   ${specific} = EXCLUDED.${specific}, comment = EXCLUDED.comment, strengths = EXCLUDED.strengths,
                   improvements = EXCLUDED.improvements, would_work_again = EXCLUDED.would_work_again, updated_at = NOW()
     RETURNING id`,
    [
      subject,
      user.id,
      applicationId,
      a.request_id,
      input.overall,
      input.reliability ?? null,
      input.communication ?? null,
      side === "owner" ? input.skill ?? null : input.clarity ?? null,
      input.comment ?? null,
      input.strengths ?? input.comment ?? null,
      input.improvements ?? null,
      input.wouldWorkAgain ?? null,
      Boolean(past)
    ]
  );
  // Double-blind: when both sides have reviewed, publish both at once.
  const both = await pool.query(
    `SELECT (SELECT COUNT(*) FROM volunteer_reviews WHERE request_application_id = $1) + (SELECT COUNT(*) FROM requester_reviews WHERE request_application_id = $1) AS n`,
    [applicationId]
  );
  let published = Boolean(past);
  if (Number(both.rows[0].n) >= 2) {
    await pool.query("UPDATE volunteer_reviews SET visible_at = COALESCE(visible_at, NOW()) WHERE request_application_id = $1", [applicationId]);
    await pool.query("UPDATE requester_reviews SET visible_at = COALESCE(visible_at, NOW()) WHERE request_application_id = $1", [applicationId]);
    published = true;
  }
  return { id: String(ins.rows[0].id), side, published };
}

/** Both reviews for one application, as the caller may see them. */
export async function reviewsFor(user: PolicyUser, applicationId: string) {
  const a = await loadApplication(applicationId);
  const side = a ? sideFor(user, a) : null;
  if (!a || !side) return null;
  const cols = "id, rating AS overall, reliability, communication, comment, strengths, would_work_again, visible_at, created_at";
  const v = await pool.query(`SELECT ${cols}, skill FROM volunteer_reviews WHERE request_application_id = $1 AND removed_at IS NULL`, [applicationId]);
  const r = await pool.query(`SELECT ${cols}, clarity FROM requester_reviews WHERE request_application_id = $1 AND removed_at IS NULL`, [applicationId]);
  const mine = side === "owner" ? v.rows[0] : r.rows[0];
  const theirs = side === "owner" ? r.rows[0] : v.rows[0];
  const revealAt = a.completed_at ? new Date(new Date(a.completed_at).getTime() + REVIEW_WINDOW_DAYS * 86400_000).toISOString() : null;
  return {
    side,
    can_review: a.status === "completed" && !mine?.visible_at,
    mine: mine ?? null,
    // The other side's review stays hidden until both have reviewed or the window closes.
    theirs: theirs && theirs.visible_at && new Date(theirs.visible_at) <= new Date() ? theirs : null,
    theirs_submitted: Boolean(theirs),
    reveal_at: revealAt
  };
}

/** Publishes reviews whose 14-day window has passed (hourly). */
export async function revealDueReviews() {
  let n = 0;
  for (const t of ["volunteer_reviews", "requester_reviews"]) {
    const r = await pool.query(
      `UPDATE ${t} rv SET visible_at = NOW()
         FROM request_applications a
        WHERE a.id = rv.request_application_id AND rv.visible_at IS NULL
          AND a.completed_at < NOW() - INTERVAL '${REVIEW_WINDOW_DAYS} days'`
    );
    n += r.rowCount ?? 0;
  }
  return n;
}

/** SQL for a user's reliability (as a volunteer) — a stat, not a star rating. */
export const RELIABILITY_SQL = (userExpr: string) => `(
  SELECT json_build_object(
    'completed', COUNT(*) FILTER (WHERE rel_a.status = 'completed'),
    'late_cancels', COUNT(*) FILTER (WHERE rel_c.late_cancel AND rel_c.canceled_by = 'volunteer'),
    'no_shows', COUNT(*) FILTER (WHERE rel_c.no_show),
    'rate', CASE WHEN COUNT(*) FILTER (WHERE rel_a.status = 'completed' OR (rel_c.late_cancel AND rel_c.canceled_by = 'volunteer') OR rel_c.no_show) = 0 THEN NULL
                 ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE rel_a.status = 'completed')
                      / COUNT(*) FILTER (WHERE rel_a.status = 'completed' OR (rel_c.late_cancel AND rel_c.canceled_by = 'volunteer') OR rel_c.no_show)) END)
    FROM request_applications rel_a
    LEFT JOIN request_commitments rel_c ON rel_c.request_id = rel_a.request_id AND rel_c.volunteer_user_id = rel_a.volunteer_user_id
   WHERE rel_a.volunteer_user_id = ${userExpr})`;

export async function reliabilityOf(userId: string) {
  const r = await pool.query(`SELECT ${RELIABILITY_SQL("$1")} AS rel`, [userId]);
  return r.rows[0].rel as { completed: number; late_cancels: number; no_shows: number; rate: number | null };
}

/**
 * Records a cancellation on the commitment. A volunteer canceling less than 24 hours before the
 * start is a late cancellation (shown on their reliability).
 */
export async function recordCommitmentCancel(applicationId: string, by: "volunteer" | "owner" | "system") {
  const canceled = await pool.query(
    `UPDATE request_commitments c
        SET status = 'canceled', canceled_at = NOW(), canceled_by = $2, updated_at = NOW(),
            late_cancel = ($2 = 'volunteer' AND COALESCE(c.start_at, r.starts_at) IS NOT NULL
                           AND COALESCE(c.start_at, r.starts_at) - NOW() < INTERVAL '24 hours')
       FROM request_applications a, service_requests r
      WHERE a.id = $1 AND c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id AND r.id = a.request_id
        AND c.status IN ('scheduled', 'confirmed')
      RETURNING c.id, c.start_at`,
    [applicationId, by]
  );
  // Calendars that had this shift get a cancellation (same UID, next SEQUENCE).
  await calendarChanged(canceled.rows.filter((r) => r.start_at).map((r) => String(r.id)), "cancel");
  // A volunteer who cancels with no commitment row yet but inside 24 h of the start still counts.
  if (by === "volunteer") {
    await pool.query(
      `INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, canceled_at, canceled_by, late_cancel)
       SELECT a.volunteer_user_id, a.request_id, 'canceled', r.starts_at, NOW(), 'volunteer', TRUE
         FROM request_applications a JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1 AND r.starts_at IS NOT NULL AND r.starts_at - NOW() < INTERVAL '24 hours'
          AND NOT EXISTS (SELECT 1 FROM request_commitments c WHERE c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id)`,
      [applicationId]
    );
  }
}
