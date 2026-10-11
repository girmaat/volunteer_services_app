/**
 * Volunteer badges. Computing is read-only; awarding (persisting + notifying) runs as a background
 * job after work is completed, never inside a GET request.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { completedWork } from "./impact";
import { pool } from "../../lib/db";
import { notify } from "../notifications/service";

export async function computeBadges(userId: string) {
    const seenRes = await pool.query("SELECT last_seen_at FROM volunteer_badge_state WHERE volunteer_user_id = $1", [userId]);
    const lastSeen = seenRes.rows[0]?.last_seen_at ? new Date(seenRes.rows[0].last_seen_at) : new Date(0);

    const [completed, hours, reviews] = await Promise.all([
      pool.query(
        `SELECT updated_at FROM request_applications WHERE volunteer_user_id = $1 AND status='completed' ORDER BY updated_at ASC`,
        [userId]
      ),
      // Hour milestones use the same hours as Impact: completed engagements plus other logged time.
      completedWork(userId).then(async (work) => {
        const extra = await pool.query(
          `SELECT d, hrs FROM (
             SELECT impact_date::date AS d, COALESCE(hours,0)::float AS hrs, request_id FROM volunteer_impact_entries WHERE volunteer_user_id = $1
             UNION ALL
             SELECT task_date::date, COALESCE(duration_hours,0)::float, request_id FROM volunteer_task_entries WHERE volunteer_user_id = $1
           ) x WHERE d IS NOT NULL AND (request_id IS NULL OR NOT (request_id = ANY($2::uuid[])))`,
          [userId, work.map((w) => w.request_id)]
        );
        const rows = [...work.map((w) => ({ d: w.completed_at, hrs: w.hours })), ...extra.rows.map((r) => ({ d: String(r.d), hrs: Number(r.hrs) }))];
        rows.sort((a, b) => new Date(a.d).getTime() - new Date(b.d).getTime());
        return { rows };
      }),
      pool.query(`SELECT rating, created_at FROM visible_volunteer_reviews WHERE volunteer_user_id = $1 ORDER BY created_at ASC`, [userId])
    ]);

    const completedDates = (completed.rows || []).map((r: any) => new Date(r.updated_at).toISOString());
    const completedCount = completedDates.length;

    const earnedAtCompletion = (n: number) => (completedDates.length >= n ? completedDates[n - 1] : null);

    const hourEvents = (hours.rows || []).map((r: any) => ({ d: r.d ? String(r.d) : null, hrs: Number(r.hrs || 0) }));
    let cumulative = 0;
    const hourEarnedAt: Record<number, string | null> = { 10: null, 25: null, 50: null, 100: null };
    for (const ev of hourEvents) {
      cumulative += ev.hrs;
      for (const threshold of Object.keys(hourEarnedAt).map((k) => Number(k))) {
        if (hourEarnedAt[threshold] == null && cumulative >= threshold && ev.d) {
          hourEarnedAt[threshold] = new Date(ev.d).toISOString();
        }
      }
    }

    const reviewCount = (reviews.rows || []).length;
    const avgRating =
      reviewCount > 0 ? reviews.rows.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / reviewCount : 0;

    const badges = [
      {
        id: "first_completion",
        title: "First completed opportunity",
        description: "Complete your first engagement.",
        earned: completedCount >= 1,
        earned_at: earnedAtCompletion(1),
        progress: completedCount,
        goal: 1
      },
      {
        id: "five_completions",
        title: "5 completed opportunities",
        description: "Complete five engagements.",
        earned: completedCount >= 5,
        earned_at: earnedAtCompletion(5),
        progress: completedCount,
        goal: 5
      },
      {
        id: "ten_hours",
        title: "10 volunteer hours",
        description: "Reach 10 volunteer hours.",
        earned: cumulative >= 10,
        earned_at: hourEarnedAt[10],
        progress: cumulative,
        goal: 10
      },
      {
        id: "twentyfive_hours",
        title: "25 volunteer hours",
        description: "Log at least 25 total hours (impact + tasks).",
        earned: cumulative >= 25,
        earned_at: hourEarnedAt[25],
        progress: cumulative,
        goal: 25
      },
      {
        id: "ten_reviews",
        title: "10 reviews received",
        description: "Receive 10 reviews from requesters.",
        earned: reviewCount >= 10,
        earned_at: reviewCount >= 10 ? new Date(reviews.rows[9].created_at).toISOString() : null,
        progress: reviewCount,
        goal: 10
      }
    ].map((b) => ({
      ...b,
      is_new: b.earned && b.earned_at ? new Date(b.earned_at) > lastSeen : false
    }));

    const milestones = [
      { id: "completed", label: "Completed opportunities", value: completedCount },
      { id: "hours", label: "Total hours", value: cumulative },
      { id: "reviews", label: "Reviews received", value: reviewCount },
      { id: "avg_rating", label: "Average rating", value: avgRating }
    ];

  return { badges, milestones, lastSeen };
}

/** Job "badges.award": persist newly earned badges and tell the volunteer. */
export async function awardBadges({ userId }: { userId: string }) {
  const flag = await pool.query("SELECT enabled FROM feature_flags WHERE key = 'badges'");
  if (!flag.rows[0]?.enabled) return 0;
  const { badges } = await computeBadges(userId);
  let n = 0;
  for (const b of badges.filter((x) => x.earned)) {
    const earnedAt = b.earned_at ? new Date(b.earned_at) : new Date();
    const r = await pool.query(
      `INSERT INTO volunteer_badge_awards (volunteer_user_id, badge_id, earned_at) VALUES ($1, $2, $3)
       ON CONFLICT (volunteer_user_id, badge_id) DO NOTHING RETURNING badge_id`,
      [userId, b.id, earnedAt.toISOString()]
    );
    if (r.rowCount) {
      n++;
      await notify(userId, "application_status", { title: `New badge: ${b.title}`, href: "/volunteer/history/badges" });
    }
  }
  return n;
}
