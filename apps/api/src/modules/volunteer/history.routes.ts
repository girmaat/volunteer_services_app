/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requireVolunteerUser } from "../../middleware/auth";
import { illustrateRows } from "./helpers";
import { pool } from "../../lib/db";
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

    const totalHours = Number(impact.rows[0]?.hours || 0) + Number(tasks.rows[0]?.hours || 0);

    return res.json({
      completed_count: completed.rows[0]?.count ?? 0,
      impact_count: impact.rows[0]?.count ?? 0,
      tasks_count: tasks.rows[0]?.count ?? 0,
      outcomes_count: outcomes.rows[0]?.count ?? 0,
      total_hours: totalHours
    });
  })
);



app.get(
  "/v1/volunteer/history/completed",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.status,
        a.updated_at,
        o.id AS request_id,
        o.title,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        org.name AS organization_name,
        o.requester_user_id AS requester_user_id,
        o.tags
      FROM request_applications a
      JOIN service_requests o ON o.id = a.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE a.volunteer_user_id = $1 AND a.status = 'completed'
      ORDER BY a.updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.get(
  "/v1/volunteer/history/impact",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        e.id,
        e.impact_date,
        e.hours,
        e.notes,
        e.request_id,
        e.request_application_id,
        o.title,
        org.name AS organization_name
      FROM volunteer_impact_entries e
      LEFT JOIN service_requests o ON o.id = e.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE e.volunteer_user_id = $1
      ORDER BY e.impact_date DESC, e.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.post(
  "/v1/volunteer/history/impact",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const body = z
      .object({
        request_id: z.string().uuid(),
        request_application_id: z.string().uuid().optional(),
        impact_date: z.string().min(1),
        hours: z.number().min(0).max(1000),
        notes: z.string().optional()
      })
      .parse(req.body);

    await pool.query(
      `
      INSERT INTO volunteer_impact_entries
        (volunteer_user_id, request_application_id, request_id, impact_date, hours, notes)
      VALUES
        ($1, $2, $3, $4::date, $5, $6)
      `,
      [user.id, body.request_application_id ?? null, body.request_id, body.impact_date, body.hours, body.notes ?? null]
    );

    return res.status(201).json({ ok: true });
  })
);



app.get(
  "/v1/volunteer/history/tasks",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        t.id,
        t.task_date,
        t.task,
        t.duration_hours,
        t.request_id,
        t.request_application_id,
        o.title,
        org.name AS organization_name
      FROM volunteer_task_entries t
      LEFT JOIN service_requests o ON o.id = t.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE t.volunteer_user_id = $1
      ORDER BY t.task_date DESC, t.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.post(
  "/v1/volunteer/history/tasks",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const body = z
      .object({
        request_id: z.string().uuid(),
        request_application_id: z.string().uuid().optional(),
        task_date: z.string().min(1),
        task: z.string().min(1).max(500),
        duration_hours: z.number().min(0).max(1000)
      })
      .parse(req.body);

    await pool.query(
      `
      INSERT INTO volunteer_task_entries
        (volunteer_user_id, request_application_id, request_id, task_date, task, duration_hours)
      VALUES
        ($1, $2, $3, $4::date, $5, $6)
      `,
      [user.id, body.request_application_id ?? null, body.request_id, body.task_date, body.task, body.duration_hours]
    );

    return res.status(201).json({ ok: true });
  })
);



app.get(
  "/v1/volunteer/history/outcomes",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        o2.id,
        o2.outcome_date,
        o2.outcome,
        o2.quantity,
        o2.unit,
        o2.request_id,
        o2.request_application_id,
        o.title,
        org.name AS organization_name
      FROM volunteer_outcome_entries o2
      LEFT JOIN service_requests o ON o.id = o2.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE o2.volunteer_user_id = $1
      ORDER BY o2.outcome_date DESC, o2.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.post(
  "/v1/volunteer/history/outcomes",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const body = z
      .object({
        request_id: z.string().uuid(),
        request_application_id: z.string().uuid().optional(),
        outcome_date: z.string().min(1),
        outcome: z.string().min(1).max(800),
        quantity: z.number().optional(),
        unit: z.string().optional()
      })
      .parse(req.body);

    await pool.query(
      `
      INSERT INTO volunteer_outcome_entries
        (volunteer_user_id, request_application_id, request_id, outcome_date, outcome, quantity, unit)
      VALUES
        ($1, $2, $3, $4::date, $5, $6, $7)
      `,
      [
        user.id,
        body.request_application_id ?? null,
        body.request_id,
        body.outcome_date,
        body.outcome,
        body.quantity ?? null,
        body.unit ?? null
      ]
    );

    return res.status(201).json({ ok: true });
  })
);



app.get(
  "/v1/volunteer/history/hours",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const impact = await pool.query(
      `
      SELECT
        request_id,
        COALESCE(SUM(hours), 0)::float AS hours
      FROM volunteer_impact_entries
      WHERE volunteer_user_id = $1
      GROUP BY request_id
      `,
      [user.id]
    );

    const tasks = await pool.query(
      `
      SELECT
        request_id,
        COALESCE(SUM(duration_hours), 0)::float AS hours
      FROM volunteer_task_entries
      WHERE volunteer_user_id = $1
      GROUP BY request_id
      `,
      [user.id]
    );

    const byReq = new Map<string, number>();
    const add = (reqId: string | null, hrs: number) => {
      const key = reqId ?? "unassigned";
      byReq.set(key, (byReq.get(key) || 0) + Number(hrs || 0));
    };

    for (const r of impact.rows) add(r.request_id, r.hours);
    for (const r of tasks.rows) add(r.request_id, r.hours);

    const ids = Array.from(byReq.keys()).filter((k) => k !== "unassigned");
    const meta = ids.length
      ? await pool.query(
          `
          SELECT
            o.id AS request_id,
            o.title,
            org.name AS organization_name
          FROM service_requests o
          LEFT JOIN organizations org ON org.slug = o.requester_org_slug
          WHERE o.id = ANY($1::uuid[])
          `,
          [ids]
        )
      : { rows: [] as any[] };

    const metaMap = new Map<string, any>();
    for (const r of meta.rows) metaMap.set(r.request_id, r);

    const breakdown = Array.from(byReq.entries())
      .map(([key, hours]) => {
        if (key === "unassigned") {
          return { request_id: null, title: "Unassigned", organization_name: null, hours };
        }
        const m = metaMap.get(key);
        return { request_id: key, title: m?.title ?? "Unknown", organization_name: m?.organization_name ?? null, hours };
      })
      .sort((a, b) => b.hours - a.hours);

    const total_hours = breakdown.reduce((sum, r) => sum + Number(r.hours || 0), 0);

    return res.json({ total_hours, breakdown });
  })
);




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

    const seenRes = await pool.query("SELECT last_seen_at FROM volunteer_badge_state WHERE volunteer_user_id = $1", [user.id]);
    const lastSeen = seenRes.rows[0]?.last_seen_at ? new Date(seenRes.rows[0].last_seen_at) : new Date(0);

    const [completed, hours, reviews] = await Promise.all([
      pool.query(
        `SELECT updated_at FROM request_applications WHERE volunteer_user_id = $1 AND status='completed' ORDER BY updated_at ASC`,
        [user.id]
      ),
      pool.query(
        `
        SELECT d, hrs FROM (
          SELECT impact_date::date AS d, COALESCE(hours,0)::float AS hrs
          FROM volunteer_impact_entries
          WHERE volunteer_user_id = $1
          UNION ALL
          SELECT task_date::date AS d, COALESCE(duration_hours,0)::float AS hrs
          FROM volunteer_task_entries
          WHERE volunteer_user_id = $1
        ) x
        WHERE d IS NOT NULL
        ORDER BY d ASC
        `,
        [user.id]
      ),
      pool.query(`SELECT rating, created_at FROM visible_volunteer_reviews WHERE volunteer_user_id = $1 ORDER BY created_at ASC`, [user.id])
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
        description: "Log at least 10 total hours (impact + tasks).",
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

    // Persist earned badges so the UI can highlight "New" reliably.
    const earnedBadges = badges.filter((b) => b.earned);
    for (const b of earnedBadges) {
      const earnedAt = b.earned_at ? new Date(b.earned_at) : new Date();
      await pool.query(
        `
        INSERT INTO volunteer_badge_awards (volunteer_user_id, badge_id, earned_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (volunteer_user_id, badge_id)
        DO UPDATE SET earned_at = LEAST(volunteer_badge_awards.earned_at, EXCLUDED.earned_at)
        `,
        [user.id, b.id, earnedAt.toISOString()]
      );
    }

    const milestones = [
      { id: "completed", label: "Completed opportunities", value: completedCount },
      { id: "hours", label: "Total hours", value: cumulative },
      { id: "reviews", label: "Reviews received", value: reviewCount },
      { id: "avg_rating", label: "Average rating", value: avgRating }
    ];

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
}
