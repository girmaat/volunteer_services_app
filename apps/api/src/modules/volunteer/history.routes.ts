/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { requireVolunteerUser } from "../../middleware/auth";
import { illustrateRows } from "./helpers";
import { pool } from "../../lib/db";
import { computeBadges } from "./badges";
import { totalHours } from "./impact";
import { wrap } from "../../lib/http";

export function registerVolunteerHistoryRoutes(app: Express) {



app.get(
  "/v1/volunteer/history/summary",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const completed = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM request_applications
       WHERE volunteer_user_id = $1 AND status = 'completed'`,
      [user.id]
    );

    const impact = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(hours), 0)::float AS hours
       FROM volunteer_impact_entries
       WHERE volunteer_user_id = $1`,
      [user.id]
    );

    const tasks = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(duration_hours), 0)::float AS hours
       FROM volunteer_task_entries
       WHERE volunteer_user_id = $1`,
      [user.id]
    );

    const outcomes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM volunteer_outcome_entries
       WHERE volunteer_user_id = $1`,
      [user.id]
    );

    // Hours count once a reviewer approves them; waiting and self-reported hours are reported separately.
    const { work, hours: allHours, summary } = await totalHours(user.id);

    return res.json({
      recent_completed: work.slice(0, 5).map((d) => ({ application_id: d.application_id, title: d.title, completed_at: d.completed_at, hours: d.hours, pending_hours: d.pending_hours })),
      completed_hours: allHours,
      completed_count: completed.rows[0]?.count ?? 0,
      impact_count: impact.rows[0]?.count ?? 0,
      tasks_count: tasks.rows[0]?.count ?? 0,
      outcomes_count: outcomes.rows[0]?.count ?? 0,
      total_hours: allHours,
      pending_hours: summary.pending,
      self_reported_hours: summary.self_reported
    });
  })
);



// The free-form log (impact, tasks, outcomes) and its hour totals were retired: hours are
// contributions now, reviewed by the organization (see modules/contributions). Old entries
// stay in the data export.

app.get(
  "/v1/volunteer/history/reviews",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        vr.id,
        vr.rating,
        vr.strengths,
        vr.improvements,
        vr.would_work_again,
        vr.created_at,
        vr.request_id,
        vr.request_application_id,
        r.title AS request_title,
        org.name AS organization_name,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS reviewer_name
      FROM visible_volunteer_reviews vr
      LEFT JOIN service_requests r ON r.id = vr.request_id
      LEFT JOIN organizations org ON org.slug = r.requester_org_slug
      LEFT JOIN users u ON u.id = vr.reviewer_user_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE vr.volunteer_user_id = $1
      ORDER BY vr.created_at DESC
      `,
      [user.id]
    );

    const avg = rows.rows.length
      ? rows.rows.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / rows.rows.length
      : 0;

    return res.json({ average_rating: avg, count: rows.rows.length, reviews: illustrateRows(rows.rows) });
  })
);




app.get(
  "/v1/volunteer/history/badges",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const flag = await pool.query("SELECT enabled FROM feature_flags WHERE key = 'badges'");
    const enabled = Boolean(flag.rows[0]?.enabled);

    if (!enabled) {
      return res.json({
        enabled: false,
        badges: [],
        milestones: [],
        message:
          "Badges are currently disabled. An admin can enable them by setting feature_flags.enabled=true where key='badges'."
      });
    }

    const { badges, milestones, lastSeen } = await computeBadges(String(user.id));
    return res.json({ enabled: true, badges, milestones, last_seen_at: lastSeen.toISOString() });
  })
);



app.post(
  "/v1/volunteer/history/badges/seen",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    await pool.query(
      `
      INSERT INTO volunteer_badge_state (volunteer_user_id, last_seen_at)
      VALUES ($1, NOW())
      ON CONFLICT (volunteer_user_id) DO UPDATE SET last_seen_at = NOW()
      `,
      [user.id]
    );

    return res.json({ ok: true });
  })
);

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
