/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { enqueue } from "../../jobs/queue";
import { requireRequesterUser } from "../../middleware/auth";
import { RequesterApplicationRow, RequesterRequestDetail, RequesterRequestRow, normalizeTags, parseOptionalDate } from "./helpers";
import { pool } from "../../lib/db";
import { applyLegacyStatus, createAndPublishLegacy } from "../requests/legacy";
import { wrap } from "../../lib/http";

export function registerRequesterRequestsRoutes(app: Express) {




// Requester area: my active requests list (Step 4.6)
app.get(
  "/v1/requester/requests/active",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        r.id,
        r.title,
        r.description,
        r.status,
        r.updated_at,
        COALESCE(apps.applicants, 0)::int AS applicants,
        COALESCE(confs.confirmed, 0)::int AS confirmed
      FROM service_requests r
      LEFT JOIN (
        SELECT request_id, COUNT(*)::int AS applicants
        FROM request_applications
        WHERE status IN ('pending','accepted')
        GROUP BY request_id
      ) apps ON apps.request_id = r.id
      LEFT JOIN (
        SELECT request_id, COUNT(*)::int AS confirmed
        FROM request_commitments
        WHERE status IN ('scheduled','confirmed')
        GROUP BY request_id
      ) confs ON confs.request_id = r.id
      WHERE r.requester_user_id = $1
        AND r.status IN ('open','pending','filled','paused')
      ORDER BY r.updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);



app.get(
  "/v1/requester/requests",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        id,
        title,
        LEFT(description, 240) AS summary,
        status,
        COALESCE(location_text, '') AS location,
        COALESCE(mode, 'remote') AS mode,
        needed_by,
        tags,
        created_at,
        updated_at
      FROM service_requests
      WHERE requester_user_id = $1
      ORDER BY updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows as RequesterRequestRow[]);
  })
);



app.get(
  "/v1/requester/requests/:id",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const rows = await pool.query(
      `
      SELECT
        id,
        requester_user_id,
        title,
        description,
        status,
        COALESCE(location_text, '') AS location,
        COALESCE(mode, 'remote') AS mode,
        needed_by,
        tags,
        requester_org_slug,
        created_at,
        updated_at
      FROM service_requests
      WHERE id = $1 AND requester_user_id = $2
      `,
      [id, user.id]
    );

    if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });
    return res.json(rows.rows[0] as RequesterRequestDetail);
  })
);



app.post(
  "/v1/requester/requests",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const schema = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(20000),
      status: z.enum(["open", "paused", "closed"]).optional().default("open"),
      locationText: z.string().trim().max(200).optional().nullable(),
      mode: z.enum(["in-person", "remote", "hybrid"]).optional().nullable(),
      neededBy: z.string().optional().nullable(),
      tags: z.string().optional().nullable(),
      requesterOrgSlug: z.string().trim().min(1).max(80).optional().nullable()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const neededByIso = parseOptionalDate(parsed.data.neededBy);
    if (parsed.data.neededBy && !neededByIso) {
      return res.status(400).json({ message: "Invalid neededBy date" });
    }
    const requestId = await createAndPublishLegacy({
      userId: String(user.id),
      orgSlug: null,
      title: parsed.data.title,
      description: parsed.data.description,
      mode: parsed.data.mode || "remote",
      area: parsed.data.locationText || "",
      neededBy: neededByIso,
      tags: parsed.data.tags ? normalizeTags(parsed.data.tags) : [],
      status: parsed.data.status || "open"
    });
    return res.status(201).json({ id: requestId });
  })
);



app.put(
  "/v1/requester/requests/:id",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const schema = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(20000),
      status: z.enum(["open", "paused", "closed"]),
      locationText: z.string().trim().max(200).nullable(),
      mode: z.enum(["in-person", "remote", "hybrid"]).nullable(),
      neededBy: z.string().nullable(),
      tags: z.string().nullable()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const existing = await pool.query(
      "SELECT requester_org_slug FROM service_requests WHERE id = $1 AND requester_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Not found" });

    const neededByIso = parseOptionalDate(parsed.data.neededBy);
    if (parsed.data.neededBy && !neededByIso) {
      return res.status(400).json({ message: "Invalid neededBy date" });
    }

    const nextTags = parsed.data.tags ? normalizeTags(parsed.data.tags) : [];

    const update = await pool.query(
      `
      UPDATE service_requests
      SET
        title = $3,
        description = $4,
        location_text = $6,
        public_area = NULLIF($6, ''),
        mode = $7,
        needed_by = $8,
        starts_at = COALESCE($8, starts_at),
        tags = $9,
        required_skills = COALESCE($9, '{}'),
        updated_at = NOW()
      WHERE id = $1 AND requester_user_id = $2 AND ($5::text IS NOT NULL)
      RETURNING
        id,
        requester_user_id,
        title,
        description,
        status,
        COALESCE(location_text, '') AS location,
        COALESCE(mode, 'remote') AS mode,
        needed_by,
        tags,
        requester_org_slug,
        created_at,
        updated_at
      `,
      [
        id,
        user.id,
        parsed.data.title,
        parsed.data.description,
        parsed.data.status,
        parsed.data.locationText || "",
        parsed.data.mode || "remote",
        neededByIso,
        nextTags.length ? nextTags : null
      ]
    );

    if (update.rowCount === 0) return res.status(404).json({ message: "Not found" });
    const moved = await applyLegacyStatus(id, String(update.rows[0].status), parsed.data.status, String(user.id));
    if (moved) update.rows[0].status = moved;

    // Best-effort geocode for in-person/hybrid requests (powers Nearby).
    if (String(parsed.data.mode || "remote") !== "remote" && String(parsed.data.locationText || "").trim()) {
      await enqueue("geocode.request", { requestId: id, locationText: String(parsed.data.locationText || "") });
    }

    return res.json(update.rows[0] as RequesterRequestDetail);
  })
);



app.get(
  "/v1/requester/requests/:id/applications",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid request id" });
    const requestId = idParsed.data;

    const rows = await pool.query(
      `
      SELECT
        a.id,
        a.request_id,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        a.volunteer_user_id,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS volunteer_display_name,
        p.avatar_url AS volunteer_avatar_url,
        COALESCE(p.public_location, p.location) AS volunteer_public_location,
        p.bio AS volunteer_bio,
        u.verification_status AS volunteer_verification_status
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      JOIN users u ON u.id = a.volunteer_user_id
      LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
      WHERE a.request_id = $1
        AND r.requester_user_id = $2
      ORDER BY a.created_at DESC
      `,
      [requestId, user.id]
    );

    return res.json(rows.rows as RequesterApplicationRow[]);
  })
);
}
