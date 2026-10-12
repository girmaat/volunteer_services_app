import type { Express } from "express";
import { requireVolunteerUser } from "../../middleware/auth";
import { pool } from "../../lib/db";
import { computeBadges } from "./badges";
import { totalHours } from "./impact";
import { wrap } from "../../lib/http";

export function registerVolunteerHistoryRoutes(app: Express) {

// The free-form log (impact, tasks, outcomes) and its hour totals were retired: hours are
// contributions now, reviewed by the organization (see modules/contributions). Old entries
// stay in the data export.

// The Impact page in one call: approved / waiting / self-reported hours, the timeline of work with
// each contribution and its decision, badges and what people said.
app.get(
  "/v1/volunteer/impact",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;
    const uid = String(user.id);
    const [{ work, summary }, outside, badgeState, reviews] = await Promise.all([
      totalHours(uid),
      pool.query(
        `SELECT c.id, c.status, c.started_at, c.reported_hours::float AS hours, c.description AS text, c.created_at
           FROM contributions c WHERE c.volunteer_user_id = $1 AND c.application_id IS NULL ORDER BY COALESCE(c.started_at, c.created_at) DESC`,
        [uid]
      ),
      computeBadges(uid),
      pool.query(
        `SELECT vr.rating, vr.comment, vr.created_at, r.title AS request_title,
                COALESCE(o.name, NULLIF(p.display_name, ''), 'Member') AS reviewer_name
           FROM visible_volunteer_reviews vr
           LEFT JOIN service_requests r ON r.id = vr.request_id
           LEFT JOIN organizations o ON o.slug = r.requester_org_slug
           LEFT JOIN user_profiles p ON p.user_id = vr.reviewer_user_id
          WHERE vr.volunteer_user_id = $1
          ORDER BY vr.created_at DESC`,
        [uid]
      )
    ]);
    const ratings = reviews.rows.map((r) => Number(r.rating || 0));
    return res.json({
      totals: {
        hours: summary.approved,
        pending_hours: summary.pending,
        self_reported_hours: summary.self_reported,
        units: summary.units,
        completed: work.filter((w) => w.application_status === "completed").length,
        organizations: new Set(work.filter((w) => w.org_slug).map((w) => w.org_slug)).size,
        people: new Set(work.filter((w) => w.requester_user_id).map((w) => w.requester_user_id)).size,
        badges: badgeState.badges.filter((b: { earned: boolean }) => b.earned).length
      },
      timeline: work.map(({ requester_user_id: _r, org_slug: _o, ...w }) => w),
      outside: outside.rows,
      badges: badgeState.badges,
      reviews: {
        count: ratings.length,
        average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        latest: reviews.rows.slice(0, 3)
      }
    });
  })
);
}
