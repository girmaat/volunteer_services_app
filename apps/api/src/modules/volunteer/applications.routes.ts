/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { contentDisposition } from "../../lib/http";
import { requireVolunteerUser } from "../../middleware/auth";
import { illustrateRows } from "./helpers";
import { pool } from "../../lib/db";
import { afterApplicationUpdate } from "../requests/applications";
import { wrap } from "../../lib/http";

export function registerVolunteerApplicationsRoutes(app: Express) {




app.get(
  "/v1/volunteer/applications",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        a.id,
        a.request_id AS opportunity_id,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        o.title,
        LEFT(o.description, 240) AS summary,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        o.requester_org_slug AS organization_slug,
        org.name AS organization_name,
        o.requester_user_id AS requester_user_id,
        o.tags
      FROM request_applications a
      JOIN service_requests o ON o.id = a.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE a.volunteer_user_id = $1
      ORDER BY a.updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.get(
  "/v1/volunteer/applications/:id",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const rows = await pool.query(
      `
      SELECT
        a.id,
        a.request_id AS opportunity_id,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        o.title,
        COALESCE(o.public_area, o.location_text, '') AS location,
        o.exact_address,
        o.status AS request_status,
        o.starts_at, o.ends_at, o.timezone, o.schedule_type, o.recurrence_rule,
        COALESCE(o.mode, 'remote') AS mode,
        org.name AS organization_name,
        o.requester_user_id AS requester_user_id,
        o.tags
      FROM request_applications a
      JOIN service_requests o ON o.id = a.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE a.volunteer_user_id = $1
        AND a.id = $2
      LIMIT 1
      `,
      [user.id, id]
    );

    if (rows.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const r = rows.rows[0] as any;

    const commitmentRes = await pool.query(
      `
      SELECT id, status, start_at, end_at
      FROM request_commitments
      WHERE volunteer_user_id = $1 AND request_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [user.id, r.opportunity_id]
    );

    const commitment = commitmentRes.rowCount
      ? {
          id: commitmentRes.rows[0].id,
          status: commitmentRes.rows[0].status,
          start_at: commitmentRes.rows[0].start_at,
          end_at: commitmentRes.rows[0].end_at
        }
      : null;

    return res.json({
      id: r.id,
      opportunity_id: r.opportunity_id,
      status: r.status,
      message: r.message,
      created_at: r.created_at,
      updated_at: r.updated_at,
      requester_user_id: r.requester_user_id ?? null,
      commitment,
      opportunity: {
        id: r.opportunity_id,
        title: r.title,
        location: r.location,
        // 4.5: the exact address is revealed only once the application is accepted.
        exact_address: ["accepted", "confirmed", "completed"].includes(String(r.status)) ? r.exact_address ?? null : null,
        status: r.request_status,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        timezone: r.timezone,
        schedule_type: r.schedule_type,
        recurrence_rule: r.recurrence_rule,
        mode: r.mode,
        organization_name: r.organization_name,
        tags: r.tags
      }
    });
  })
);





app.post(
  "/v1/volunteer/applications/:id/withdraw",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const existing = await pool.query(
      "SELECT id, status FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(existing.rows[0]?.status || "");
    if (status !== "pending" && status !== "waitlisted") {
      return res.status(409).json({ message: `Cannot withdraw from status '${status}'` });
    }

    const updated = await pool.query(
      "UPDATE request_applications SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 RETURNING id, status, updated_at",
      [id]
    );

    await afterApplicationUpdate(id, "withdrawn", String(user.id));
    return res.status(200).json({ id: updated.rows[0]?.id, status: updated.rows[0]?.status, updated_at: updated.rows[0]?.updated_at });
  })
);



app.post(
  "/v1/volunteer/applications/:id/schedule",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const body = z
      .object({
        start_at: z.string().min(1),
        end_at: z.string().optional()
      })
      .parse(req.body);

    const existing = await pool.query(
      "SELECT id, status, request_id FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(existing.rows[0]?.status || "");
    if (status !== "accepted" && status !== "confirmed") {
      return res.status(409).json({ message: `Cannot schedule from status '${status}'` });
    }

    const requestId = String(existing.rows[0]?.request_id);
    const startAt = new Date(body.start_at);
    if (Number.isNaN(startAt.getTime())) return res.status(400).json({ message: "Invalid start_at" });
    const endAt = body.end_at ? new Date(body.end_at) : null;
    if (endAt && Number.isNaN(endAt.getTime())) return res.status(400).json({ message: "Invalid end_at" });

    const existingCommitment = await pool.query(
      "SELECT id FROM request_commitments WHERE volunteer_user_id = $1 AND request_id = $2 ORDER BY updated_at DESC LIMIT 1",
      [user.id, requestId]
    );

    let commitmentId: string | null = null;

    if ((existingCommitment.rowCount ?? 0) > 0) {
      commitmentId = String(existingCommitment.rows[0]?.id);
      await pool.query(
        "UPDATE request_commitments SET status = 'confirmed', start_at = $3, end_at = $4, updated_at = NOW() WHERE id = $1 AND volunteer_user_id = $2",
        [commitmentId, user.id, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
    } else {
      const inserted = await pool.query(
        "INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, end_at) VALUES ($1, $2, 'confirmed', $3, $4) RETURNING id",
        [user.id, requestId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
      commitmentId = inserted.rows[0]?.id ?? null;
    }

    await pool.query("UPDATE request_applications SET status = 'confirmed', updated_at = NOW() WHERE id = $1", [id]);

    return res.status(200).json({ ok: true, commitment_id: commitmentId });
  })
);



app.post(
  "/v1/volunteer/applications/:id/complete",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const existing = await pool.query(
      "SELECT id, status, request_id FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(existing.rows[0]?.status || "");
    if (status !== "confirmed") return res.status(409).json({ message: `Cannot complete from status '${status}'` });

    const requestId = String(existing.rows[0]?.request_id);

    await pool.query("UPDATE request_applications SET status = 'completed', updated_at = NOW() WHERE id = $1", [id]);
    await pool.query(
      "UPDATE request_commitments SET status = 'completed', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2",
      [user.id, requestId]
    );

    await afterApplicationUpdate(id, "completed", String(user.id));
    return res.status(200).json({ ok: true, status: "completed" });
  })
);



app.post(
  "/v1/volunteer/documents/:id/ack",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid document id" });
    const docId = idParsed.data;

    const body = z.object({ request_id: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

    const requestId = String(body.data.request_id);

    const reqRow = await pool.query("SELECT requester_org_slug FROM service_requests WHERE id = $1", [requestId]);
    if ((reqRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Opportunity not found" });
    const orgSlug = String(reqRow.rows[0]?.requester_org_slug || "");
    if (!orgSlug) return res.status(404).json({ message: "No organization associated with this request" });

    const hasApp = await pool.query(
      "SELECT 1 FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 LIMIT 1",
      [user.id, requestId]
    );
    if ((hasApp.rowCount ?? 0) === 0) return res.status(403).json({ message: "You must apply to acknowledge documents for this request." });

    const assigned = await pool.query(
      `
      SELECT 1
      FROM org_document_assignments a
      JOIN org_documents d ON d.id = a.org_document_id
      WHERE d.org_slug = $1
        AND d.id = $2
        AND d.active = TRUE
        AND (a.request_id = $3 OR a.request_id IS NULL)
      LIMIT 1
      `,
      [orgSlug, docId, requestId]
    );
    if ((assigned.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not assigned to this request" });

    await pool.query(
      `
      INSERT INTO volunteer_document_acks (org_document_id, volunteer_user_id, request_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (org_document_id, volunteer_user_id, request_id) DO NOTHING
      `,
      [docId, user.id, requestId]
    );

    return res.status(200).json({ ok: true });
  })
);



app.get(
  "/v1/volunteer/documents/:id/download",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid document id" });
    const docId = idParsed.data;

    const q = z.object({ requestId: z.string().uuid() }).safeParse(req.query);
    if (!q.success) return res.status(400).json({ message: "requestId is required" });
    const requestId = String(q.data.requestId);

    const reqRow = await pool.query("SELECT requester_org_slug FROM service_requests WHERE id = $1", [requestId]);
    if ((reqRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Opportunity not found" });
    const orgSlug = String(reqRow.rows[0]?.requester_org_slug || "");
    if (!orgSlug) return res.status(404).json({ message: "No organization associated with this request" });

    const hasApp = await pool.query(
      "SELECT 1 FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 LIMIT 1",
      [user.id, requestId]
    );
    if ((hasApp.rowCount ?? 0) === 0) return res.status(403).json({ message: "You must apply to download documents for this request." });

    const row = await pool.query(
      `
      SELECT d.file_name, d.mime_type, d.bytes
      FROM org_document_assignments a
      JOIN org_documents d ON d.id = a.org_document_id
      WHERE d.org_slug = $1
        AND d.id = $2
        AND d.active = TRUE
        AND (a.request_id = $3 OR a.request_id IS NULL)
      LIMIT 1
      `,
      [orgSlug, docId, requestId]
    );

    if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not found" });

    const r = row.rows[0] as any;
    res.setHeader("content-type", r.mime_type || "application/octet-stream");
    res.setHeader("content-disposition", contentDisposition(r.file_name));
    return res.status(200).send(r.bytes);
  })
);



// Volunteer: leave a review for the requester (two-sided reputation)
app.get("/v1/volunteer/applications/:id/review-requester", wrap(async (req, res) => {
  const user = await requireVolunteerUser(req, res);
  if (!user) return;

  const idParsed = z.string().uuid().safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
  const applicationId = idParsed.data;

  const row = await pool.query(
    `
    SELECT
      rr.id,
      rr.rating,
      rr.strengths,
      rr.improvements,
      rr.would_work_again,
      rr.created_at
    FROM requester_reviews rr
    WHERE rr.request_application_id = $1 AND rr.reviewer_user_id = $2
    LIMIT 1
    `,
    [applicationId, user.id]
  );

  return res.json({ review: row.rowCount ? illustrateRows(row.rows[0]) : null });
}));



app.post("/v1/volunteer/applications/:id/review-requester", wrap(async (req, res) => {
  const user = await requireVolunteerUser(req, res);
  if (!user) return;

  const idParsed = z.string().uuid().safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
  const applicationId = idParsed.data;

  const body = z
    .object({
      rating: z.number().int().min(1).max(5),
      strengths: z.string().max(2000).optional(),
      improvements: z.string().max(2000).optional(),
      would_work_again: z.boolean().optional()
    })
    .parse(req.body);

  const appRes = await pool.query(
    `
    SELECT a.id, a.status, a.request_id, r.requester_user_id
    FROM request_applications a
    JOIN service_requests r ON r.id = a.request_id
    WHERE a.id = $1 AND a.volunteer_user_id = $2
    `,
    [applicationId, user.id]
  );

  if (appRes.rowCount === 0) return res.status(404).json({ message: "Application not found" });

  const status = String(appRes.rows[0]?.status || "");
  if (status !== "completed") {
    return res.status(409).json({ message: "Reviews can be left once the engagement is completed." });
  }

  const requestId = String(appRes.rows[0]?.request_id);
  const requesterUserId = String(appRes.rows[0]?.requester_user_id);

  const upsert = await pool.query(
    `
    INSERT INTO requester_reviews
      (requester_user_id, reviewer_user_id, request_application_id, request_id, rating, strengths, improvements, would_work_again)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (request_application_id) WHERE request_application_id IS NOT NULL
    DO UPDATE SET
      rating = EXCLUDED.rating,
      strengths = EXCLUDED.strengths,
      improvements = EXCLUDED.improvements,
      would_work_again = EXCLUDED.would_work_again
    RETURNING id
    `,
    [
      requesterUserId,
      user.id,
      applicationId,
      requestId,
      body.rating,
      body.strengths || null,
      body.improvements || null,
      typeof body.would_work_again === "boolean" ? body.would_work_again : null
    ]
  );

  return res.json({ id: String(upsert.rows[0]?.id), ok: true });
}));




app.get(
  "/v1/volunteer/calendar/commitments",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        c.id,
        c.status,
        c.start_at,
        c.end_at,
        c.request_id AS opportunity_id,
        o.title,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode
      FROM request_commitments c
      LEFT JOIN service_requests o ON o.id = c.request_id
      WHERE c.volunteer_user_id = $1
        AND c.status IN ('scheduled','confirmed')
        AND c.start_at IS NOT NULL
        AND c.start_at > NOW()
      ORDER BY c.start_at ASC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);
}
