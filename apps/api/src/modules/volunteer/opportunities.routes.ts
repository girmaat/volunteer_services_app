/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { cachedUserGeo } from "../../lib/geoRuntime";
import { requireVolunteerUser } from "../../middleware/auth";
import { listVolunteerSavedOpportunities, volunteerOpportunityRowsForUser } from "./helpers";
import { pool } from "../../lib/db";
import { discoverableSql } from "../requests/lifecycle";
import { applyEligibility } from "../requests/eligibility";
import { ensureConversation, sendMessage, SendError } from "../messaging/service";
import { sendDetail } from "../discovery/routes";
import { loadViewer } from "../discovery/query";
import { enqueue } from "../../jobs/queue";
import type { PolicyUser } from "../../lib/policy";
import { wrap } from "../../lib/http";

export function registerVolunteerOpportunitiesRoutes(app: Express) {



app.get(
  "/v1/volunteer/opportunities/recommended",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    try {

    // Profile signals (tags + freeform experience) feed a simple, deterministic recommender.
    const profile = await pool.query(
      `
      SELECT
        COALESCE(help_categories, '{}'::text[]) AS help_categories,
        COALESCE(experience_tags, '{}'::text[]) AS experience_tags,
        COALESCE(languages, '{}'::text[]) AS languages,
        COALESCE(interaction_styles, '{}'::text[]) AS interaction_styles,
        COALESCE(service_radius_miles, 25) AS radius,
        COALESCE(experience, '') AS experience,
        public_location,
        location
      FROM user_profiles
      WHERE user_id = $1
      `,
      [user.id]
    );

    const p = (profile.rows[0] || {}) as any;
    const userTags = Array.from(new Set([...(p.help_categories || []), ...(p.experience_tags || [])].map((s: any) => String(s).toLowerCase())));
    const experience = String(p.experience || "").trim();

    const radius = Math.min(Math.max(Math.floor(Number(p.radius || 25)), 1), 200);
    const label = String(p.public_location || p.location || "").trim();

    // Availability mode constraints
    const avail = await pool.query(
      `SELECT remote_ok, in_person_ok FROM user_availability WHERE user_id=$1`,
      [user.id]
    );

    const remoteOk = Boolean(avail.rows[0]?.remote_ok ?? true);
    const inPersonOk = Boolean(avail.rows[0]?.in_person_ok ?? true);

    const allowedModes: string[] = [];
    if (remoteOk) allowedModes.push("remote", "hybrid");
    if (inPersonOk) allowedModes.push("in-person", "hybrid");
    if (allowedModes.length === 0) allowedModes.push("remote");

    // Keep geo reasonably fresh so distance can contribute when applicable.
    const userGeo = await cachedUserGeo(user.id);

    const distanceExpr = `
      (3958.7613 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS((o.location_lat - $5) / 2)), 2)
        + COS(RADIANS($5)) * COS(RADIANS(o.location_lat))
        * POWER(SIN(RADIANS((o.location_lng - $6) / 2)), 2)
      )))
    `;

    let rows: any;
    try {
      rows = await pool.query(
      `
      WITH base AS (
        SELECT
          o.id,
          o.title,
          LEFT(o.description, 240) AS summary,
          COALESCE(o.location_text, '') AS location,
          COALESCE(o.mode, 'remote') AS mode,
          o.updated_at,
          org.name AS organization_name,
          o.requester_org_slug AS organization_slug,
          o.requester_user_id AS requester_user_id,
          o.tags,
          (s.user_id IS NOT NULL) AS saved,
          a.id AS application_id,
          a.status AS application_status,
          ARRAY(
            SELECT unnest(COALESCE(o.tags, '{}'::text[]))
            INTERSECT
            SELECT unnest($2::text[])
          ) AS matched_tags,
          similarity($3, COALESCE(o.title, '') || ' ' || COALESCE(o.description, '')) AS text_sim,
          CASE
            WHEN $4::boolean AND o.location_lat IS NOT NULL AND o.location_lng IS NOT NULL AND $5::float8 IS NOT NULL AND $6::float8 IS NOT NULL
            THEN ${distanceExpr}
            ELSE NULL
          END AS distance_miles
        FROM service_requests o
        LEFT JOIN organizations org ON org.slug = o.requester_org_slug
        LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
        LEFT JOIN LATERAL (
          SELECT id, status
          FROM request_applications
          WHERE volunteer_user_id = $1 AND request_id = o.id
          ORDER BY updated_at DESC
          LIMIT 1
        ) a ON TRUE
        WHERE
          ${discoverableSql("o")} AND NOT o.is_sensitive
          AND COALESCE(o.mode, 'remote') = ANY($7::text[])
      )
      SELECT
        *,
        COALESCE(array_length(matched_tags, 1), 0) AS tag_overlap,
        GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) AS recency_score,
        CASE
          WHEN distance_miles IS NULL THEN 0
          WHEN distance_miles <= $8 THEN GREATEST(0, 1 - (distance_miles / $8))
          ELSE 0
        END AS distance_score,
        (
          (COALESCE(array_length(matched_tags, 1), 0) * 3.0)
          + (GREATEST(text_sim, 0) * 5.0)
          + (GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) * 2.0)
          + (CASE
              WHEN distance_miles IS NULL THEN 0
              WHEN distance_miles <= $8 THEN GREATEST(0, 1 - (distance_miles / $8)) * 1.5
              ELSE 0
            END)
        ) AS recommendation_score
      FROM base
      ORDER BY recommendation_score DESC, updated_at DESC
      LIMIT 60
      `,
      [
        user.id,
        userTags,
        experience,
        userGeo ? true : false,
        userGeo ? userGeo.lat : null,
        userGeo ? userGeo.lng : null,
        allowedModes,
        radius
      ]
    );
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      const code = String(e?.code || "");
      // If pg_trgm isn't installed, Postgres throws undefined_function (42883) for similarity()
      const missingSimilarity = code === "42883" && msg.includes("similarity");
      if (!missingSimilarity) throw e;

      rows = await pool.query(
      `WITH base AS (
        SELECT
          o.id,
          o.title,
          LEFT(o.description, 240) AS summary,
          COALESCE(o.location_text, '') AS location,
          COALESCE(o.mode, 'remote') AS mode,
          o.updated_at,
          org.name AS organization_name,
          o.requester_org_slug AS organization_slug,
          o.requester_user_id AS requester_user_id,
          o.tags,
          (s.user_id IS NOT NULL) AS saved,
          a.id AS application_id,
          a.status AS application_status,
          ARRAY(
            SELECT unnest(COALESCE(o.tags, '{}'::text[]))
            INTERSECT
            SELECT unnest($2::text[])
          ) AS matched_tags,
          0::double precision AS text_sim,
          CASE
            WHEN $3::boolean AND o.location_lat IS NOT NULL AND o.location_lng IS NOT NULL AND $4::float8 IS NOT NULL AND $5::float8 IS NOT NULL
            THEN (3958.7613 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS((o.location_lat - $4) / 2)), 2)
              + COS(RADIANS($4)) * COS(RADIANS(o.location_lat))
              * POWER(SIN(RADIANS((o.location_lng - $5) / 2)), 2)
            )))
            ELSE NULL
          END AS distance_miles
        FROM service_requests o
        LEFT JOIN organizations org ON org.slug = o.requester_org_slug
        LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
        LEFT JOIN LATERAL (
          SELECT id, status
          FROM request_applications
          WHERE volunteer_user_id = $1 AND request_id = o.id
          ORDER BY updated_at DESC
          LIMIT 1
        ) a ON TRUE
        WHERE
          ${discoverableSql("o")} AND NOT o.is_sensitive
          AND COALESCE(o.mode, 'remote') = ANY($6::text[])
      )
      SELECT
        *,
        COALESCE(array_length(matched_tags, 1), 0) AS tag_overlap,
        GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) AS recency_score,
        CASE
          WHEN distance_miles IS NULL THEN 0
          WHEN distance_miles <= $7 THEN GREATEST(0, 1 - (distance_miles / $7))
          ELSE 0
        END AS distance_score,
        (
          (COALESCE(array_length(matched_tags, 1), 0) * 3.0)
          + (GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) * 2.0)
          + (CASE
              WHEN distance_miles IS NULL THEN 0
              WHEN distance_miles <= $7 THEN GREATEST(0, 1 - (distance_miles / $7)) * 1.5
              ELSE 0
            END)
        ) AS recommendation_score
      FROM base
      ORDER BY recommendation_score DESC, updated_at DESC
      LIMIT 60`,
      [
        user.id,
        userTags,
        userGeo ? true : false,
        userGeo ? userGeo.lat : null,
        userGeo ? userGeo.lng : null,
        allowedModes,
        radius
      ]
    );
    }

    const out = (rows.rows as any[]).map((r) => {
      const reasons: string[] = [];
      const matched = Array.isArray(r.matched_tags) ? r.matched_tags.filter(Boolean) : [];
      if (matched.length) reasons.push(`Matches your interests: ${matched.slice(0, 3).join(', ')}`);
      const textSim = Number(r.text_sim || 0);
      if (textSim >= 0.25 && experience) reasons.push("Similar to your experience");
      const d = Number(r.distance_miles);
      if (Number.isFinite(d) && d <= radius) reasons.push(`Close by: ${d.toFixed(1)} mi`);
      if (!reasons.length) reasons.push("Based on your profile");

      return {
        ...r,
        recommendation_reason: reasons[0],
        recommendation_reasons: reasons,
        recommendation_score: Number(r.recommendation_score || 0)
      };
    });

    res.setHeader("x-volunteer-radius-miles", String(radius));
    res.setHeader("x-volunteer-location-label", label);

    return res.json(out);
    } catch (e: any) {
      console.error("/v1/volunteer/opportunities/recommended failed", e);
      const rows = await volunteerOpportunityRowsForUser(user.id, "", [], "o.updated_at DESC").catch(() => []);
      res.setHeader("x-volunteer-recommended-fallback", "1");
      return res.json(rows);
    }
  })
);




app.get(
  "/v1/volunteer/opportunities/remote",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    try {
      const modes = ["remote", "hybrid"];
      const rows = await volunteerOpportunityRowsForUser(
        user.id,
        "WHERE COALESCE(o.mode, 'remote') = ANY($2::text[])",
        [modes]
      );
      return res.json(rows);
    } catch (e: any) {
      console.error("/v1/volunteer/opportunities/remote failed", e);
      res.setHeader("x-volunteer-remote-fallback", "1");
      return res.json([]);
    }
  })
);



app.get(
  "/v1/volunteer/opportunities/nearby",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // Allow callers to override radius (miles) via ?radius=25
    const radiusQ = Number((req.query as any)?.radius);

    const profile = await pool.query(
      `SELECT COALESCE(service_radius_miles, 25) AS radius, public_location, location FROM user_profiles WHERE user_id=$1`,
      [user.id]
    );

    const defaultRadius = Number(profile.rows[0]?.radius || 25);
    const radius = Number.isFinite(radiusQ) && radiusQ > 0 ? Math.min(Math.max(Math.floor(radiusQ), 1), 200) : Math.min(Math.max(Math.floor(defaultRadius), 1), 200);

    const label = String(profile.rows[0]?.public_location || profile.rows[0]?.location || "").trim();

    // Best-effort: backfill a few recently-updated requests so the first "Nearby" load isn't empty.

    const userGeo = await cachedUserGeo(user.id);
    if (!userGeo) {
      res.setHeader("x-volunteer-location-missing", "1");
      res.setHeader("x-volunteer-radius-miles", String(radius));
      res.setHeader("x-volunteer-location-label", label);
      return res.json([]);
    }

    const distanceExpr = `
      (3958.7613 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS((o.location_lat - $2) / 2)), 2)
        + COS(RADIANS($2)) * COS(RADIANS(o.location_lat))
        * POWER(SIN(RADIANS((o.location_lng - $3) / 2)), 2)
      )))
    `;

    const rows = await pool.query(
      `
      SELECT
        o.id,
        o.title,
        LEFT(o.description, 240) AS summary,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        o.updated_at,
        org.name AS organization_name,
        o.requester_org_slug AS organization_slug,
        o.requester_user_id AS requester_user_id,
        o.tags,
        (s.user_id IS NOT NULL) AS saved,
        a.id AS application_id,
        a.status AS application_status,
        ${distanceExpr} AS distance_miles
      FROM service_requests o
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
      LEFT JOIN LATERAL (
        SELECT id, status
        FROM request_applications
        WHERE volunteer_user_id = $1 AND request_id = o.id
        ORDER BY updated_at DESC
        LIMIT 1
      ) a ON TRUE
      WHERE
        ${discoverableSql("o")} AND NOT o.is_sensitive
        AND COALESCE(o.mode, 'remote') IN ('in-person','hybrid')
        AND o.location_lat IS NOT NULL
        AND o.location_lng IS NOT NULL
        AND ${distanceExpr} <= $4
      ORDER BY distance_miles ASC, o.updated_at DESC
      LIMIT 60
      `,
      [user.id, userGeo.lat, userGeo.lng, radius]
    );

    res.setHeader("x-volunteer-location-missing", "0");
    res.setHeader("x-volunteer-radius-miles", String(radius));
    res.setHeader("x-volunteer-location-label", label);

    return res.json(rows.rows);
  })
);



app.get(
  "/v1/volunteer/opportunities/saved",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const items = await listVolunteerSavedOpportunities(user.id);

    return res.json(items);
  })
);




app.get(
  "/v1/volunteer/opportunities/:id",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    // Same visibility and privacy rules as discovery (4.4/4.5).
    const viewer = await loadViewer(user as PolicyUser);
    return sendDetail(res, user as PolicyUser, viewer, id);
  })
);



app.post(
  "/v1/volunteer/opportunities/:id/save",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const exists = await pool.query("SELECT 1 FROM service_requests WHERE id = $1", [id]);
    if (exists.rowCount === 0) return res.status(404).json({ message: "Opportunity not found" });

    await pool.query(
      "INSERT INTO volunteer_saved_requests (user_id, request_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [user.id, id]
    );

    return res.status(200).json({ saved: true });
  })
);



app.delete(
  "/v1/volunteer/opportunities/:id/save",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    await pool.query("DELETE FROM volunteer_saved_requests WHERE user_id = $1 AND request_id = $2", [user.id, id]);

    return res.status(200).json({ saved: false });
  })
);



app.post(
  "/v1/volunteer/opportunities/:id/apply",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const elig = await applyEligibility(user as PolicyUser, id);
    if (!elig.eligible) {
      const first = elig.problems[0];
      const status = first.code === "not_found" || first.code === "not_open" ? 404 : first.code === "own_request" || first.code === "blocked" ? 403 : 422;
      return res.status(status).json({ error: { code: first.code, message: first.message }, message: first.message, problems: elig.problems });
    }

    const schema = z.object({
      message: z.string().trim().min(1).max(5000)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const already = await pool.query(
      "SELECT id, status FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 ORDER BY updated_at DESC LIMIT 1",
      [user.id, id]
    );
    if (already.rows.length > 0) {
      return res.status(200).json({ applicationId: already.rows[0].id, status: already.rows[0].status });
    }

    // A full request takes new applicants onto the waitlist; they move up automatically if a spot opens.
    const initial = elig.status === "filled" ? "waitlisted" : "pending";
    const inserted = await pool.query(
      "INSERT INTO request_applications (volunteer_user_id, request_id, status, message) VALUES ($1, $2, $3, $4) RETURNING id, status, created_at",
      [user.id, id, initial, parsed.data.message]
    );
    await enqueue("notify.application_received", { applicationId: String(inserted.rows[0].id) });
    // The application message opens the conversation with the organizer (same safety checks as any message).
    try {
      const conv = await ensureConversation(id, String(user.id));
      await sendMessage(user as PolicyUser, conv, parsed.data.message);
    } catch (err) {
      if (!(err instanceof SendError)) throw err;
    }

    return res.status(201).json({
      applicationId: inserted.rows[0]?.id,
      status: inserted.rows[0]?.status,
      createdAt: inserted.rows[0]?.created_at
    });
  })
);



app.get(
  "/v1/volunteer/saved",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // Deprecated alias for backwards compatibility (shares canonical implementation).
    res.setHeader("x-deprecated", "Use /v1/volunteer/opportunities/saved instead.");

    const items = await listVolunteerSavedOpportunities(user.id);

    return res.json(items);
  })
);






// Volunteer: required waiver/training documents for a request + acknowledgement
app.get(
  "/v1/volunteer/requests/:id/documents",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid request id" });
    const requestId = idParsed.data;

    const reqRow = await pool.query("SELECT requester_org_slug FROM service_requests WHERE id = $1", [requestId]);
    if ((reqRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Opportunity not found" });
    const orgSlug = String(reqRow.rows[0]?.requester_org_slug || "");
    if (!orgSlug) return res.json({ documents: [] });

    const hasApp = await pool.query(
      "SELECT 1 FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 LIMIT 1",
      [user.id, requestId]
    );
    if ((hasApp.rowCount ?? 0) === 0) return res.status(403).json({ message: "You must apply to view required documents for this request." });

    const docs = await pool.query(
      `
      SELECT
        d.id,
        d.doc_type,
        d.title,
        d.description,
        d.file_name,
        d.mime_type,
        d.require_ack,
        d.active,
        (ack.id IS NOT NULL) AS acknowledged,
        ack.acknowledged_at
      FROM org_document_assignments a
      JOIN org_documents d ON d.id = a.org_document_id
      LEFT JOIN volunteer_document_acks ack
        ON ack.org_document_id = d.id
        AND ack.volunteer_user_id = $2
        AND ack.request_id = $1
      WHERE d.org_slug = $3
        AND d.active = TRUE
        AND (a.request_id = $1 OR a.request_id IS NULL)
      ORDER BY d.created_at DESC
      `,
      [requestId, user.id, orgSlug]
    );

    return res.json({ documents: docs.rows });
  })
);
}
