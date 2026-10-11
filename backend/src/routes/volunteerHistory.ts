import type express from "express";
import type { Pool } from "pg";
import { z } from "zod";

type Wrap = (fn: (req: express.Request, res: express.Response) => Promise<any>) => (req: express.Request, res: express.Response) => void;
type RequireVolunteerUser = (req: express.Request, res: express.Response) => Promise<{ id: string } | null>;

function toNumber(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function registerVolunteerHistoryRoutes(
  app: express.Express,
  pool: Pool,
  wrap: Wrap,
  requireVolunteerUser: RequireVolunteerUser
) {
  app.get(
    "/v1/volunteer/history/summary",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const [completed, impacts, tasks, outcomes, hours] = await Promise.all([
        pool.query(
          "SELECT COUNT(*)::int AS count FROM request_applications WHERE volunteer_user_id = $1 AND status = 'completed'",
          [user.id]
        ),
        pool.query("SELECT COUNT(*)::int AS count FROM volunteer_impact_entries WHERE volunteer_user_id = $1", [user.id]),
        pool.query("SELECT COUNT(*)::int AS count FROM volunteer_task_entries WHERE volunteer_user_id = $1", [user.id]),
        pool.query("SELECT COUNT(*)::int AS count FROM volunteer_outcome_entries WHERE volunteer_user_id = $1", [user.id]),
        pool.query(
          `
          SELECT
            COALESCE((SELECT SUM(hours) FROM volunteer_impact_entries WHERE volunteer_user_id = $1), 0)::float AS impact_hours,
            COALESCE((SELECT SUM(duration_hours) FROM volunteer_task_entries WHERE volunteer_user_id = $1), 0)::float AS task_hours
          `,
          [user.id]
        )
      ]);

      const impactHours = toNumber(hours.rows[0]?.impact_hours);
      const taskHours = toNumber(hours.rows[0]?.task_hours);

      return res.json({
        completed_count: toNumber(completed.rows[0]?.count),
        impact_count: toNumber(impacts.rows[0]?.count),
        task_count: toNumber(tasks.rows[0]?.count),
        outcome_count: toNumber(outcomes.rows[0]?.count),
        total_hours: impactHours + taskHours
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
          a.request_id,
          a.status,
          a.created_at,
          a.updated_at,
          r.title AS request_title,
          org.name AS org_name
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        LEFT JOIN organizations org ON org.slug = r.requester_org_slug
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
          e.request_application_id,
          e.request_id,
          e.entry_date,
          e.hours,
          e.notes,
          e.created_at,
          r.title AS request_title,
          org.name AS org_name
        FROM volunteer_impact_entries e
        LEFT JOIN service_requests r ON r.id = e.request_id
        LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        WHERE e.volunteer_user_id = $1
        ORDER BY e.entry_date DESC, e.created_at DESC
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

      const schema = z.object({
        request_application_id: z.string().uuid(),
        entry_date: z.string().optional(),
        hours: z.coerce.number().min(0).max(1000).optional(),
        notes: z.string().min(1).max(5000)
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const appRes = await pool.query(
        "SELECT request_id FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
        [parsed.data.request_application_id, user.id]
      );
      if (appRes.rowCount === 0) return res.status(404).json({ message: "Application not found" });

      const requestId = appRes.rows[0]?.request_id as string;

      const insert = await pool.query(
        `
        INSERT INTO volunteer_impact_entries (volunteer_user_id, request_application_id, request_id, entry_date, hours, notes)
        VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), COALESCE($5, 0), $6)
        RETURNING id, entry_date, hours, notes, created_at
        `,
        [
          user.id,
          parsed.data.request_application_id,
          requestId,
          parsed.data.entry_date ?? null,
          parsed.data.hours ?? null,
          parsed.data.notes
        ]
      );

      return res.status(201).json(insert.rows[0]);
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
          t.request_application_id,
          t.request_id,
          t.task_date,
          t.description,
          t.duration_hours,
          t.created_at,
          r.title AS request_title,
          org.name AS org_name
        FROM volunteer_task_entries t
        LEFT JOIN service_requests r ON r.id = t.request_id
        LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        WHERE t.volunteer_user_id = $1
        ORDER BY t.task_date DESC NULLS LAST, t.created_at DESC
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

      const schema = z.object({
        request_application_id: z.string().uuid(),
        task_date: z.string().optional(),
        description: z.string().min(1).max(5000),
        duration_hours: z.coerce.number().min(0).max(1000).optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const appRes = await pool.query(
        "SELECT request_id FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
        [parsed.data.request_application_id, user.id]
      );
      if (appRes.rowCount === 0) return res.status(404).json({ message: "Application not found" });

      const requestId = appRes.rows[0]?.request_id as string;

      const insert = await pool.query(
        `
        INSERT INTO volunteer_task_entries (volunteer_user_id, request_application_id, request_id, task_date, description, duration_hours)
        VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, COALESCE($6, 0))
        RETURNING id, task_date, description, duration_hours, created_at
        `,
        [
          user.id,
          parsed.data.request_application_id,
          requestId,
          parsed.data.task_date ?? null,
          parsed.data.description,
          parsed.data.duration_hours ?? null
        ]
      );

      return res.status(201).json(insert.rows[0]);
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
          o.id,
          o.request_application_id,
          o.request_id,
          o.outcome_date,
          o.outcome,
          o.quantity,
          o.unit,
          o.created_at,
          r.title AS request_title,
          org.name AS org_name
        FROM volunteer_outcome_entries o
        LEFT JOIN service_requests r ON r.id = o.request_id
        LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        WHERE o.volunteer_user_id = $1
        ORDER BY o.outcome_date DESC NULLS LAST, o.created_at DESC
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

      const schema = z.object({
        request_application_id: z.string().uuid(),
        outcome_date: z.string().optional(),
        outcome: z.string().min(1).max(5000),
        quantity: z.coerce.number().min(0).max(1000000).optional(),
        unit: z.string().max(120).optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const appRes = await pool.query(
        "SELECT request_id FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
        [parsed.data.request_application_id, user.id]
      );
      if (appRes.rowCount === 0) return res.status(404).json({ message: "Application not found" });

      const requestId = appRes.rows[0]?.request_id as string;

      const insert = await pool.query(
        `
        INSERT INTO volunteer_outcome_entries (volunteer_user_id, request_application_id, request_id, outcome_date, outcome, quantity, unit)
        VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, $7)
        RETURNING id, outcome_date, outcome, quantity, unit, created_at
        `,
        [
          user.id,
          parsed.data.request_application_id,
          requestId,
          parsed.data.outcome_date ?? null,
          parsed.data.outcome,
          parsed.data.quantity ?? null,
          parsed.data.unit ?? null
        ]
      );

      return res.status(201).json(insert.rows[0]);
    })
  );

  app.get(
    "/v1/volunteer/history/hours",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;

      const totals = await pool.query(
        `
        SELECT
          COALESCE((SELECT SUM(hours) FROM volunteer_impact_entries WHERE volunteer_user_id = $1), 0)::float AS impact_hours,
          COALESCE((SELECT SUM(duration_hours) FROM volunteer_task_entries WHERE volunteer_user_id = $1), 0)::float AS task_hours
        `,
        [user.id]
      );

      const impactHours = toNumber(totals.rows[0]?.impact_hours);
      const taskHours = toNumber(totals.rows[0]?.task_hours);

      const breakdown = await pool.query(
        `
        WITH impact AS (
          SELECT request_id, SUM(hours)::float AS hours
          FROM volunteer_impact_entries
          WHERE volunteer_user_id = $1
          GROUP BY request_id
        ),
        tasks AS (
          SELECT request_id, SUM(duration_hours)::float AS hours
          FROM volunteer_task_entries
          WHERE volunteer_user_id = $1
          GROUP BY request_id
        ),
        reqs AS (
          SELECT DISTINCT request_id
          FROM request_applications
          WHERE volunteer_user_id = $1
        )
        SELECT
          r.id AS request_id,
          r.title AS request_title,
          org.name AS org_name,
          COALESCE(impact.hours, 0)::float + COALESCE(tasks.hours, 0)::float AS hours
        FROM reqs
        JOIN service_requests r ON r.id = reqs.request_id
        LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        LEFT JOIN impact ON impact.request_id = r.id
        LEFT JOIN tasks ON tasks.request_id = r.id
        ORDER BY hours DESC, r.title ASC
        `,
        [user.id]
      );

      return res.json({
        total_hours: impactHours + taskHours,
        sources: { impact_hours: impactHours, task_hours: taskHours },
        per_request: breakdown.rows
      });
    })
  );
}
