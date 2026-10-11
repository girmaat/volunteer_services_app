import type { Application } from "express";
import type { Pool } from "pg";

/**
 * Volunteer History endpoints (Steps 3.10–3.12)
 * These routes are wired into visible UI under /volunteer/history/*
 */
export function registerVolunteerHistoryRoutes(
  app: Application,
  pool: Pool,
  wrap: any,
  requireVolunteerUser: any
) {
  // Summary tiles for /volunteer/history
  app.get(
    "/v1/volunteer/history/summary",
    wrap(async (req: any, res: any) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const [completed, impact, taskCount, outcomeCount, impactHours, taskHours] = await Promise.all([
        pool.query(
          `SELECT COALESCE(COUNT(*), 0)::int AS n
           FROM request_applications
           WHERE volunteer_user_id = $1 AND status = 'completed'`,
          [user.id]
        ),
        pool.query(
          `SELECT COALESCE(COUNT(*), 0)::int AS n
           FROM volunteer_impact_entries
           WHERE user_id = $1`,
          [user.id]
        ),
        pool.query(
          `SELECT COALESCE(COUNT(*), 0)::int AS n
           FROM volunteer_task_entries
           WHERE user_id = $1`,
          [user.id]
        ),
        pool.query(
          `SELECT COALESCE(COUNT(*), 0)::int AS n
           FROM volunteer_outcome_entries
           WHERE user_id = $1`,
          [user.id]
        ),
        pool.query(
          `SELECT COALESCE(SUM(hours), 0)::float AS n
           FROM volunteer_impact_entries
           WHERE user_id = $1`,
          [user.id]
        ),
        pool.query(
          `SELECT COALESCE(SUM(duration_hours), 0)::float AS n
           FROM volunteer_task_entries
           WHERE user_id = $1`,
          [user.id]
        )
      ]);

      const impactHoursN = Number(impactHours.rows[0]?.n ?? 0);
      const taskHoursN = Number(taskHours.rows[0]?.n ?? 0);

      return res.json({
        completedCount: Number(completed.rows[0]?.n ?? 0),
        impactCount: Number(impact.rows[0]?.n ?? 0),
        tasksCount: Number(taskCount.rows[0]?.n ?? 0),
        outcomesCount: Number(outcomeCount.rows[0]?.n ?? 0),
        totalHours: Math.round((impactHoursN + taskHoursN) * 100) / 100,
        impactHours: Math.round(impactHoursN * 100) / 100,
        taskHours: Math.round(taskHoursN * 100) / 100
      });
    })
  );

  // Step 3.10 – Completed opportunities list
  app.get(
    "/v1/volunteer/history/completed",
    wrap(async (req: any, res: any) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const rows = await pool.query(
        `
        SELECT
          a.id AS application_id,
          a.request_id AS opportunity_id,
          a.status,
          a.updated_at AS completed_at,
          o.title,
          COALESCE(o.mode, 'remote') AS mode,
          COALESCE(o.location_text, '') AS location,
          o.requester_org_slug AS organization_slug,
          org.name AS organization_name,
          o.tags
        FROM request_applications a
        JOIN service_requests o ON o.id = a.request_id
        LEFT JOIN organizations org ON org.slug = o.requester_org_slug
        WHERE a.volunteer_user_id = $1 AND a.status = 'completed'
        ORDER BY a.updated_at DESC
        LIMIT 200
        `,
        [user.id]
      );

      return res.json(rows.rows);
    })
  );

  // Step 3.11 – Impact log entries
  app.get(
    "/v1/volunteer/history/impact",
    wrap(async (req: any, res: any) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const rows = await pool.query(
        `
        SELECT
          i.id,
          i.request_id AS opportunity_id,
          o.title,
          i.entry_date,
          i.hours,
          i.notes,
          i.created_at
        FROM volunteer_impact_entries i
        LEFT JOIN service_requests o ON o.id = i.request_id
        WHERE i.user_id = $1
        ORDER BY i.entry_date DESC, i.created_at DESC
        LIMIT 500
        `,
        [user.id]
      );

      return res.json(rows.rows);
    })
  );

  // Step 3.12 – Hours aggregation (total + per opportunity)
  app.get(
    "/v1/volunteer/history/hours",
    wrap(async (req: any, res: any) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const totals = await pool.query(
        `
        SELECT
          COALESCE((SELECT SUM(hours)::float FROM volunteer_impact_entries WHERE user_id = $1), 0)::float AS impact_hours,
          COALESCE((SELECT SUM(duration_hours)::float FROM volunteer_task_entries WHERE user_id = $1), 0)::float AS task_hours
        `,
        [user.id]
      );

      const breakdown = await pool.query(
        `
        WITH impact AS (
          SELECT request_id, SUM(hours)::float AS impact_hours
          FROM volunteer_impact_entries
          WHERE user_id = $1
          GROUP BY request_id
        ),
        tasks AS (
          SELECT request_id, SUM(duration_hours)::float AS task_hours
          FROM volunteer_task_entries
          WHERE user_id = $1
          GROUP BY request_id
        ),
        ids AS (
          SELECT request_id FROM impact
          UNION
          SELECT request_id FROM tasks
        )
        SELECT
          ids.request_id AS opportunity_id,
          o.title,
          COALESCE(impact.impact_hours, 0)::float AS impact_hours,
          COALESCE(tasks.task_hours, 0)::float AS task_hours,
          (COALESCE(impact.impact_hours, 0) + COALESCE(tasks.task_hours, 0))::float AS total_hours
        FROM ids
        LEFT JOIN service_requests o ON o.id = ids.request_id
        LEFT JOIN impact ON impact.request_id = ids.request_id
        LEFT JOIN tasks ON tasks.request_id = ids.request_id
        ORDER BY total_hours DESC, o.title ASC NULLS LAST
        LIMIT 500
        `,
        [user.id]
      );

      const impactHoursN = Number(totals.rows[0]?.impact_hours ?? 0);
      const taskHoursN = Number(totals.rows[0]?.task_hours ?? 0);

      return res.json({
        totalHours: Math.round((impactHoursN + taskHoursN) * 100) / 100,
        impactHours: Math.round(impactHoursN * 100) / 100,
        taskHours: Math.round(taskHoursN * 100) / 100,
        byOpportunity: breakdown.rows
      });
    })
  );

  // Step 3.12 – Tasks list
  app.get(
    "/v1/volunteer/history/tasks",
    wrap(async (req: any, res: any) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const rows = await pool.query(
        `
        SELECT
          t.id,
          t.request_id AS opportunity_id,
          o.title,
          t.task_date,
          t.description,
          t.duration_hours,
          t.created_at
        FROM volunteer_task_entries t
        LEFT JOIN service_requests o ON o.id = t.request_id
        WHERE t.user_id = $1
        ORDER BY t.task_date DESC, t.created_at DESC
        LIMIT 500
        `,
        [user.id]
      );

      return res.json(rows.rows);
    })
  );

  // Step 3.12 – Outcomes list
  app.get(
    "/v1/volunteer/history/outcomes",
    wrap(async (req: any, res: any) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const rows = await pool.query(
        `
        SELECT
          o2.id,
          o2.request_id AS opportunity_id,
          sr.title,
          o2.outcome_date,
          o2.outcome,
          o2.quantity,
          o2.unit,
          o2.created_at
        FROM volunteer_outcome_entries o2
        LEFT JOIN service_requests sr ON sr.id = o2.request_id
        WHERE o2.user_id = $1
        ORDER BY o2.outcome_date DESC, o2.created_at DESC
        LIMIT 500
        `,
        [user.id]
      );

      return res.json(rows.rows);
    })
  );
}
