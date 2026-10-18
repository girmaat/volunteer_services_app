import type { Express } from "express";
import { z } from "zod";
import { contentDisposition } from "../../lib/http";
import { requireVolunteerUser } from "../../middleware/auth";
import { pool } from "../../lib/db";
import { afterApplicationUpdate } from "../requests/applications";
import { commitmentIcs } from "../calendar/updates";
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
        a.offer_expires_at,
        a.offered_amount::float AS offered_amount,
        a.accepted_amount::float AS accepted_amount,
        o.target_unit,
        o.requires_guardian_consent,
        o.requester_org_slug,
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

    const r = rows.rows[0];

    const commitmentRes = await pool.query(
      `
      SELECT id, status, start_at, end_at, volunteer_confirmed_at
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
          end_at: commitmentRes.rows[0].end_at,
          volunteer_confirmed_at: commitmentRes.rows[0].volunteer_confirmed_at
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
      offer_expires_at: r.offer_expires_at ?? null,
      offered_amount: r.offered_amount ?? null,
      accepted_amount: r.accepted_amount ?? null,
      target_unit: r.target_unit ?? null,
      requires_guardian_consent: Boolean(r.requires_guardian_consent),
      is_org: Boolean(r.requester_org_slug),
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
    if (status !== "pending" && status !== "waitlisted" && status !== "offered") {
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

    // Applicants can read every form; anyone may read the forms a live request wants signed before applying.
    const hasApp = await pool.query(
      `SELECT 1 FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2
       UNION ALL
       SELECT 1 FROM service_requests r WHERE r.id = $2 AND r.status IN ('open', 'pending', 'filled') AND r.review_status = 'approved' LIMIT 1`,
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

    const r = row.rows[0];
    res.setHeader("content-type", r.mime_type || "application/octet-stream");
    res.setHeader("content-disposition", contentDisposition(r.file_name));
    return res.status(200).send(r.bytes);
  })
);

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

// One commitment as a calendar file. Only the volunteer's own; the exact address is included
// because a commitment exists only after they were accepted.
app.get(
  "/v1/volunteer/calendar/commitments/:id/ics",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: "Invalid id" });
    const own = await pool.query("SELECT 1 FROM request_commitments WHERE id = $1 AND volunteer_user_id = $2", [id.data, user.id]);
    if (!own.rowCount) return res.status(404).json({ message: "Commitment not found" });
    const ics = await commitmentIcs(id.data);
    if (!ics) return res.status(404).json({ message: "Commitment not found" });
    const body = ics.body;
    res.setHeader("content-type", "text/calendar; charset=utf-8");
    res.setHeader("content-disposition", 'attachment; filename="volunteer-services-app-commitment.ics"');
    res.setHeader("cache-control", "private, no-store");
    return res.send(body);
  })
);
}
