/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requireRequesterUser } from "../../middleware/auth";
import { updateApplicationDecision } from "./helpers";
import { pool } from "../../lib/db";
import { afterApplicationUpdate, FULL_MESSAGE } from "../requests/applications";
import { wrap } from "../../lib/http";

export function registerRequesterApplicationsRoutes(app: Express) {


// Requester area: pending applications across all requests
app.get(
  "/v1/requester/applications/pending",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.request_id,
        r.title AS request_title,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        a.volunteer_user_id,
        u.email AS volunteer_email,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS volunteer_display_name,
        p.avatar_url AS volunteer_avatar_url,
        COALESCE(p.public_location, p.location) AS volunteer_public_location,
        p.bio AS volunteer_bio,
        u.verification_status AS volunteer_verification_status
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      JOIN users u ON u.id = a.volunteer_user_id
      LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
      WHERE r.requester_user_id = $1
        AND a.status IN ('pending','waitlisted')
      ORDER BY a.created_at DESC
      LIMIT 100
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.post(
  "/v1/requester/applications/:id/accept",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const result = await updateApplicationDecision(user.id, applicationId, "accepted");
    if (result.kind === "not_found") return res.status(404).json({ message: "Application not found" });
    if (result.kind === "conflict") {
      return res.status(409).json({ message: `Cannot accept an application in status '${result.status}'` });
    }
    if (result.kind === "full") return res.status(409).json({ error: { code: "full", message: FULL_MESSAGE }, message: FULL_MESSAGE });

    return res.status(200).json({ id: applicationId, status: result.status });
  })
);



app.post(
  "/v1/requester/applications/:id/reject",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const result = await updateApplicationDecision(user.id, applicationId, "rejected");
    if (result.kind === "not_found") return res.status(404).json({ message: "Application not found" });
    if (result.kind === "conflict") {
      return res.status(409).json({ message: `Cannot reject an application in status '${result.status}'` });
    }

    return res.status(200).json({ id: applicationId, status: result.status });
  })
);




app.post(
  "/v1/requester/applications/:id/confirm",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const body = z
      .object({
        start_at: z.string().min(1),
        end_at: z.string().optional()
      })
      .parse(req.body);

    const appRes = await pool.query(
      `
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status !== "accepted" && status !== "confirmed") {
      return res.status(409).json({ message: `Cannot confirm/schedule from status '${status}'` });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    const startAt = new Date(body.start_at);
    if (Number.isNaN(startAt.getTime())) return res.status(400).json({ message: "Invalid start_at" });
    const endAt = body.end_at ? new Date(body.end_at) : null;
    if (endAt && Number.isNaN(endAt.getTime())) return res.status(400).json({ message: "Invalid end_at" });

    const existingCommitment = await pool.query(
      "SELECT id FROM request_commitments WHERE volunteer_user_id = $1 AND request_id = $2 ORDER BY updated_at DESC LIMIT 1",
      [volunteerUserId, requestId]
    );

    let commitmentId: string | null = null;

    if ((existingCommitment.rowCount ?? 0) > 0) {
      commitmentId = String(existingCommitment.rows[0]?.id);
      await pool.query(
        "UPDATE request_commitments SET status = 'confirmed', start_at = $3, end_at = $4, updated_at = NOW() WHERE id = $1 AND volunteer_user_id = $2",
        [commitmentId, volunteerUserId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
    } else {
      const inserted = await pool.query(
        "INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, end_at) VALUES ($1, $2, 'confirmed', $3, $4) RETURNING id",
        [volunteerUserId, requestId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
      commitmentId = inserted.rows[0]?.id ?? null;
    }

    await pool.query(
      "UPDATE request_applications SET status = 'confirmed', status_updated_at = NOW(), status_updated_by_user_id = $2::uuid, updated_at = NOW() WHERE id = $1",
      [applicationId, user.id]
    );

    await afterApplicationUpdate(applicationId, "confirmed", String(user.id));
    return res.json({ ok: true, status: "confirmed", commitment_id: commitmentId });
  })
);



app.post(
  "/v1/requester/applications/:id/cancel",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const appRes = await pool.query(
      `
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status === "canceled") return res.json({ ok: true, status: "canceled" });
    if (status !== "accepted" && status !== "confirmed") {
      return res.status(409).json({ message: `Cannot cancel from status '${status}'` });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    await pool.query(
      "UPDATE request_applications SET status = 'canceled', status_updated_at = NOW(), status_updated_by_user_id = $2::uuid, updated_at = NOW() WHERE id = $1",
      [applicationId, user.id]
    );

    await pool.query(
      "UPDATE request_commitments SET status = 'canceled', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2 AND status <> 'completed'",
      [volunteerUserId, requestId]
    );

    await afterApplicationUpdate(applicationId, "canceled", String(user.id));
    return res.json({ ok: true, status: "canceled" });
  })
);



app.post(
  "/v1/requester/applications/:id/complete",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const appRes = await pool.query(
      `
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status === "completed") return res.json({ ok: true, status: "completed" });
    if (status !== "confirmed") {
      return res.status(409).json({ message: `Cannot complete from status '${status}'` });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    await pool.query(
      "UPDATE request_applications SET status = 'completed', status_updated_at = NOW(), status_updated_by_user_id = $2::uuid, updated_at = NOW() WHERE id = $1",
      [applicationId, user.id]
    );

    await pool.query(
      "UPDATE request_commitments SET status = 'completed', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2",
      [volunteerUserId, requestId]
    );

    await afterApplicationUpdate(applicationId, "completed", String(user.id));
    return res.json({ ok: true, status: "completed" });
  })
);




app.post(
  "/v1/requester/applications/:id/review",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
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
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if (appRes.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status !== "completed") {
      return res.status(409).json({ message: "Reviews can be left once the engagement is completed." });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    const upsert = await pool.query(
      `
      INSERT INTO volunteer_reviews
        (volunteer_user_id, reviewer_user_id, request_application_id, request_id, rating, strengths, improvements, would_work_again)
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
        volunteerUserId,
        user.id,
        applicationId,
        requestId,
        body.rating,
        body.strengths ?? null,
        body.improvements ?? null,
        body.would_work_again ?? null
      ]
    );

    return res.status(201).json({ ok: true, review_id: upsert.rows[0]?.id });
  })
);
}
