/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { ContactRequest } from "@thankyou/contracts";
import crypto from "crypto";
import { clientIp } from "../../lib/clientIp";
import { sendEmail } from "../../auth/email";

import { z } from "zod";
import { pool } from "../../lib/db";
import { discoverableSql } from "../requests/lifecycle";
import { wrap } from "../../lib/http";
import { parsePage, toPage } from "../../lib/pagination";
import { derivePublicLocation, looksPreciseLocation, sanitizePublicDescription } from "../../lib/redaction";
import { optionalAuthedUser } from "../../middleware/auth";
import { illustrateRows } from "../volunteer/helpers";

const PUBLIC_MODES = new Set(["in-person", "remote", "hybrid"]);

export function registerPublicRoutes(app: Express) {

// Public content
app.get("/v1/public/pages/:slug", async (req, res) => {
  const slug = req.params.slug;
  const rows = await pool.query(
    "SELECT slug, title, body, updated_at FROM public_pages WHERE slug = $1",
    [slug]
  );
  if (rows.rowCount === 0) {
    return res.status(404).json({ message: "Page not found" });
  }
  return res.json(rows.rows[0]);
});



app.get(
  "/v1/public/stories",
  wrap(async (_req, res) => {
    const rows = await pool.query(
      `
      SELECT
        id,
        slug,
        title,
        excerpt,
        body,
        cover_image_url,
        updated_at
      FROM impact_stories
      ORDER BY updated_at DESC
      `
    );

    // Ensure callers always get a usable slug (and we can keep body for back-compat generation)
    const stories = rows.rows.map((r: any) => {
      const slug =
        r.slug ||
        `${String(r.title || "story")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")}-${r.id}`;
      const body = r.body ?? r.excerpt;
      return {
        id: r.id,
        slug,
        title: r.title,
        excerpt: r.excerpt,
        updated_at: r.updated_at,
        cover_image_url: r.cover_image_url ?? null,
        body
      };
    });

    return res.json(stories.map(({ body, ...rest }) => rest)); // list stays lightweight
  })
);


app.get(
  "/v1/public/stories/:slug",
  wrap(async (req, res) => {
    const slugParam = String(req.params.slug || "").trim();
    if (!slugParam) return res.status(400).json({ message: "Invalid story slug" });

    // Back-compat: allow numeric id
    const isNumeric = /^\d+$/.test(slugParam);

    const rows = await pool.query(
      isNumeric
        ? `
          SELECT id, slug, title, excerpt, body, cover_image_url, updated_at
          FROM impact_stories
          WHERE id = $1
          LIMIT 1
          `
        : `
          SELECT id, slug, title, excerpt, body, cover_image_url, updated_at
          FROM impact_stories
          WHERE slug = $1
          LIMIT 1
          `,
      [isNumeric ? Number(slugParam) : slugParam]
    );

    if (rows.rowCount === 0) return res.status(404).json({ message: "Story not found" });

    const r = rows.rows[0] as any;
    const slug =
      r.slug ||
      `${String(r.title || "story")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}-${r.id}`;
    const body = r.body ?? r.excerpt;

    return res.json({
      id: r.id,
      slug,
      title: r.title,
      excerpt: r.excerpt,
      body,
      cover_image_url: r.cover_image_url ?? null,
      updated_at: r.updated_at
    });
  })
);


// ---------------------------------------------------------------------------
// Public read endpoints. No authentication: these back the SEO-indexed public
// pages. They return whitelisted, redacted fields only (no contact details,
// no exact addresses, no private profile data).
// ---------------------------------------------------------------------------

app.get(
  "/v1/public/organizations",
  wrap(async (req, res) => {
    const page = parsePage(req.query as Record<string, unknown>, { limit: 24, max: 50 });
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const rows = await pool.query(
      `SELECT slug, name, summary, location, verification_status, verified_at, updated_at
         FROM organizations
        WHERE ($1::text = '' OR name ILIKE '%' || $1 || '%' OR summary ILIKE '%' || $1 || '%')
        ORDER BY (verification_status = 'approved') DESC, name ASC
        LIMIT $2 OFFSET $3`,
      [q, page.limit + 1, page.offset]
    );
    const items = rows.rows.map((o: any) => ({
      slug: o.slug,
      name: o.name,
      summary: sanitizePublicDescription(String(o.summary || "")),
      location: looksPreciseLocation(String(o.location || "")) ? null : o.location,
      verified: o.verification_status === "approved",
      updated_at: o.updated_at
    }));
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(toPage(items, page));
  })
);


app.get(
  "/v1/public/organizations/:slug",
  wrap(async (req, res) => {
    const slug = String(req.params.slug || "").slice(0, 120);
    const rows = await pool.query(
      `SELECT o.slug, o.name, o.summary, o.location, o.mission, o.website_url, o.logo_url,
              o.verification_status, o.verified_at, o.updated_at, o.preferred_skills, o.service_area, o.hours, o.preferred_contact_method,
              (SELECT COUNT(*)::int FROM service_requests r WHERE r.requester_org_slug = o.slug AND ${discoverableSql("r")} AND NOT r.is_sensitive) AS open_requests
         FROM organizations o
        WHERE o.slug = $1`,
      [slug]
    );
    if (rows.rowCount === 0) return res.status(404).json({ message: "Organization not found" });
    const o: any = rows.rows[0];
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return res.json({
      slug: o.slug,
      name: o.name,
      summary: sanitizePublicDescription(String(o.summary || "")),
      mission: o.mission ? sanitizePublicDescription(String(o.mission)) : null,
      location: looksPreciseLocation(String(o.location || "")) ? null : o.location,
      website_url: /^https?:\/\//i.test(String(o.website_url || "")) ? o.website_url : null,
      logo_url: o.logo_url ?? null,
      verified: o.verification_status === "approved",
      verification_status: o.verification_status,
      verified_at: o.verified_at,
      open_requests: o.open_requests,
      preferred_skills: o.preferred_skills ?? [],
      service_area: o.service_area && !looksPreciseLocation(String(o.service_area)) ? o.service_area : null,
      hours: o.hours ? sanitizePublicDescription(String(o.hours)) : null,
      // Contact details are never public; volunteers reach organizations through the app.
      contact: o.preferred_contact_method === "email" || o.preferred_contact_method === "phone" ? "after_acceptance" : "in_app",
      updated_at: o.updated_at
    });
  })
);


app.get(
  "/v1/public/opportunities",
  wrap(async (req, res) => {
    const page = parsePage(req.query as Record<string, unknown>, { limit: 24, max: 50 });
    const orgSlug = typeof req.query.org === "string" && req.query.org.trim() ? req.query.org.trim().slice(0, 120) : null;
    const mode = typeof req.query.mode === "string" && PUBLIC_MODES.has(req.query.mode) ? req.query.mode : null;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

    const rows = await pool.query(
      `SELECT r.id, r.title, r.description, r.location_text, COALESCE(r.mode, 'remote') AS mode,
              r.tags, r.needed_by, r.updated_at,
              org.name AS organization_name, org.slug AS organization_slug,
              (org.verification_status = 'approved') AS organization_verified,
              org.location AS org_location
         FROM service_requests r
         LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        WHERE ${discoverableSql("r")} AND NOT r.is_sensitive
          AND ($1::text IS NULL OR r.requester_org_slug = $1)
          AND ($2::text IS NULL OR COALESCE(r.mode, 'remote') = $2)
          AND ($3::text = '' OR r.title ILIKE '%' || $3 || '%' OR r.description ILIKE '%' || $3 || '%')
        ORDER BY r.updated_at DESC, r.id
        LIMIT $4 OFFSET $5`,
      [orgSlug, mode, q, page.limit + 1, page.offset]
    );

    const items = rows.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      summary: sanitizePublicDescription(String(r.description || "")).slice(0, 240),
      location: derivePublicLocation(String(r.mode || "remote"), r.location_text, r.org_location),
      mode: r.mode,
      tags: Array.isArray(r.tags) ? r.tags : [],
      needed_by: r.needed_by,
      organization_name: r.organization_name ?? null,
      organization_slug: r.organization_slug ?? null,
      organization_verified: Boolean(r.organization_verified),
      updated_at: r.updated_at
    }));
    res.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=120");
    return res.json(toPage(items, page));
  })
);


app.get(
  "/v1/public/opportunities/:id",
  wrap(async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });

    const rows = await pool.query(
      `SELECT r.id, r.title, r.description, r.location_text, COALESCE(r.mode, 'remote') AS mode,
              r.tags, r.needed_by, r.updated_at,
              org.name AS organization_name, org.slug AS organization_slug,
              (org.verification_status = 'approved') AS organization_verified,
              org.location AS org_location
         FROM service_requests r
         LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        WHERE r.id = $1 AND ${discoverableSql("r")} AND NOT r.is_sensitive`,
      [idParsed.data]
    );
    if (rows.rowCount === 0) return res.status(404).json({ message: "Opportunity not found" });

    const r: any = rows.rows[0];
    res.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=120");
    return res.json({
      id: r.id,
      title: r.title,
      summary: sanitizePublicDescription(String(r.description || "")),
      location: derivePublicLocation(String(r.mode || "remote"), r.location_text, r.org_location),
      mode: r.mode,
      tags: Array.isArray(r.tags) ? r.tags : [],
      needed_by: r.needed_by,
      organization_name: r.organization_name ?? null,
      organization_slug: r.organization_slug ?? null,
      organization_verified: Boolean(r.organization_verified),
      updated_at: r.updated_at
    });
  })
);


// Public: volunteer profile (Step 3.16)
app.get("/v1/public/volunteers/:id", wrap(async (req, res) => {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid volunteer id" });

  const volunteerId = parsed.data.id;

  const row = await pool.query(
    `
    SELECT
      u.id,
      (u.email_verified_at IS NOT NULL) AS email_verified,
      u.verification_status,
      COALESCE(NULLIF(up.display_name, ''), split_part(COALESCE(up.full_name, ''), ' ', 1)) AS display_name,
      up.avatar_url,
      up.public_location AS public_location,
      up.bio,
      up.languages,
      up.interaction_styles,
      up.help_categories,
      up.has_car,
      up.can_lift_heavy,
      up.stairs_ok,
      up.pet_friendly,
      up.service_radius_miles,
      up.experience,
      u.created_at,
      up.updated_at AS profile_updated_at,
      COALESCE(ups.public_profile_visible, TRUE) AS public_profile_visible,
      COALESCE((SELECT COUNT(*)::int FROM request_applications ra WHERE ra.volunteer_user_id = u.id), 0) AS applications_count,
      COALESCE((SELECT COUNT(*)::int FROM request_commitments c WHERE c.volunteer_user_id = u.id), 0) AS commitments_total_count,
      COALESCE((SELECT COUNT(*)::int FROM request_commitments c WHERE c.volunteer_user_id = u.id AND c.status = 'completed'), 0) AS completed_count,
      COALESCE((SELECT COUNT(*)::int FROM request_commitments c WHERE c.volunteer_user_id = u.id AND c.status = 'canceled'), 0) AS canceled_count,

      COALESCE((SELECT COUNT(*)::int
        FROM volunteer_impact_entries vie
        WHERE vie.volunteer_user_id = u.id
      ), 0) AS impact_entries_count,

      COALESCE((SELECT COALESCE(SUM(hours),0)::float FROM volunteer_impact_entries vie WHERE vie.volunteer_user_id = u.id), 0) AS total_hours,
      COALESCE((SELECT COUNT(*)::int FROM visible_volunteer_reviews vr WHERE vr.volunteer_user_id = u.id), 0) AS reviews_count,
      COALESCE((SELECT COUNT(*)::int FROM visible_volunteer_reviews vr WHERE vr.volunteer_user_id = u.id AND vr.would_work_again = TRUE), 0) AS endorsements_count,
      COALESCE((SELECT COALESCE(AVG(rating),0)::float FROM visible_volunteer_reviews vr WHERE vr.volunteer_user_id = u.id), 0) AS average_rating,
      (
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)
        FROM (
          SELECT EXTRACT(EPOCH FROM (reply.created_at - msg.created_at))::float AS seconds
          FROM direct_messages msg
          JOIN LATERAL (
            SELECT created_at
            FROM direct_messages reply
            WHERE reply.sender_user_id = u.id
              AND reply.recipient_user_id = msg.sender_user_id
              AND reply.created_at > msg.created_at
            ORDER BY reply.created_at ASC
            LIMIT 1
          ) reply ON TRUE
          WHERE msg.recipient_user_id = u.id
            AND msg.sender_user_id <> u.id
            AND msg.created_at >= NOW() - INTERVAL '90 days'
            AND reply.created_at <= msg.created_at + INTERVAL '7 days'
        ) deltas
      ) AS median_reply_seconds
    FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN user_privacy_settings ups ON ups.user_id = u.id
    WHERE u.id = $1 AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'volunteer')
    `,
    [volunteerId]
  );

  if (row.rowCount === 0) return res.status(404).json({ message: "Volunteer not found" });

  const r: any = row.rows[0];

  const viewer = await optionalAuthedUser(req);
  const viewerId = viewer ? String((viewer as any).id || "") : "";
  const isAdmin = !!(viewer && (viewer as any).is_platform_admin);
  const visible = !!r.public_profile_visible;
  const canView = visible || viewerId === volunteerId || isAdmin;
  if (!canView) return res.status(404).json({ message: "Volunteer not found" });

  const commitmentsTotal = Number(r.commitments_total_count || 0);
  const canceled = Number(r.canceled_count || 0);
  const cancellation_rate = commitmentsTotal > 0 ? canceled / commitmentsTotal : null;

  return res.json({
    id: r.id,
    display_name: r.display_name || null,
    avatar_url: r.avatar_url || null,
    public_location: r.public_location || null,
    bio: r.bio || null,
    languages: r.languages || [],
    interaction_styles: r.interaction_styles || [],
    help_categories: r.help_categories || [],
    logistics: {
      has_car: typeof r.has_car === "boolean" ? r.has_car : null,
      can_lift_heavy: typeof r.can_lift_heavy === "boolean" ? r.can_lift_heavy : null,
      stairs_ok: typeof r.stairs_ok === "boolean" ? r.stairs_ok : null,
      pet_friendly: typeof r.pet_friendly === "boolean" ? r.pet_friendly : null,
      service_radius_miles: r.service_radius_miles ?? null
    },
    experience: r.experience || null,
    verification: {
      email_verified: !!r.email_verified,
      id_verification_status: r.verification_status || null
    },
    created_at: r.created_at,
    profile_updated_at: r.profile_updated_at || null,
    stats: {
      applications_count: Number(r.applications_count || 0),
      completed_count: Number(r.completed_count || 0),
      canceled_count: Number(r.canceled_count || 0),
      cancellation_rate,
      total_hours: Number(r.total_hours || 0),
      reviews_count: Number(r.reviews_count || 0),
      endorsements_count: Number(r.endorsements_count || 0),
      average_rating: Number(r.average_rating || 0),
      median_reply_seconds:
        r.median_reply_seconds === null || typeof r.median_reply_seconds === "undefined"
          ? null
          : Number(r.median_reply_seconds)
    }
  });
}));


// Public: requester profile (public-safe; shown before chat)
app.get("/v1/public/requesters/:id", wrap(async (req, res) => {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid requester id" });

  const requesterId = parsed.data.id;

  const row = await pool.query(
    `
    SELECT
      u.id,
      (u.email_verified_at IS NOT NULL) AS email_verified,
      (u.phone_verified_at IS NOT NULL) AS phone_verified,
      u.verification_status,
      COALESCE(NULLIF(up.display_name, ''), split_part(COALESCE(up.full_name, ''), ' ', 1)) AS display_name,
      up.avatar_url,
      up.public_location AS public_location,
      up.bio,
      up.languages,
      up.interaction_styles,
      up.availability_windows,

      up.need_categories,
      up.need_help_prompt,

      up.parking_available,
      up.elevator_available,
      up.stairs_present,
      up.pickup_vs_dropoff,
      up.time_flexibility,

      up.pets_at_home,
      up.smoke_free,
      up.accessibility_needs,

      up.meet_in_public_first,
      up.someone_else_present,
      up.mask_preferred,

      u.created_at,
      up.updated_at AS profile_updated_at,
      COALESCE(ups.public_profile_visible, TRUE) AS public_profile_visible,

      COALESCE((SELECT COUNT(*)::int FROM service_requests sr WHERE sr.requester_user_id = u.id), 0) AS requests_count,
      COALESCE((SELECT COUNT(*)::int
        FROM request_commitments c
        JOIN service_requests sr ON sr.id = c.request_id
        WHERE sr.requester_user_id = u.id
      ), 0) AS commitments_total_count,
      COALESCE((SELECT COUNT(*)::int
        FROM request_commitments c
        JOIN service_requests sr ON sr.id = c.request_id
        WHERE sr.requester_user_id = u.id AND c.status = 'completed'
      ), 0) AS completed_count,
      COALESCE((SELECT COUNT(*)::int
        FROM request_commitments c
        JOIN service_requests sr ON sr.id = c.request_id
        WHERE sr.requester_user_id = u.id AND c.status = 'canceled'
      ), 0) AS canceled_count,

      COALESCE((SELECT COUNT(*)::int FROM visible_volunteer_reviews vr WHERE vr.reviewer_user_id = u.id), 0) AS thank_you_notes_count,
      COALESCE((SELECT COUNT(*)::int FROM visible_volunteer_reviews vr WHERE vr.reviewer_user_id = u.id AND vr.would_work_again = TRUE), 0) AS endorsements_given_count,

      (
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)
        FROM (
          SELECT EXTRACT(EPOCH FROM (reply.created_at - msg.created_at))::float AS seconds
          FROM direct_messages msg
          JOIN LATERAL (
            SELECT created_at
            FROM direct_messages reply
            WHERE reply.sender_user_id = u.id
              AND reply.recipient_user_id = msg.sender_user_id
              AND reply.created_at > msg.created_at
            ORDER BY reply.created_at ASC
            LIMIT 1
          ) reply ON TRUE
          WHERE msg.recipient_user_id = u.id
            AND msg.sender_user_id <> u.id
            AND msg.created_at >= NOW() - INTERVAL '90 days'
            AND reply.created_at <= msg.created_at + INTERVAL '7 days'
        ) deltas
      ) AS median_reply_seconds
    FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN user_privacy_settings ups ON ups.user_id = u.id
    WHERE u.id = $1 AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role = 'requester')
    `,
    [requesterId]
  );

  if (row.rowCount === 0) return res.status(404).json({ message: "Requester not found" });

  const r: any = row.rows[0];

  const viewer = await optionalAuthedUser(req);
  const viewerId = viewer ? String((viewer as any).id || "") : "";
  const isAdmin = !!(viewer && (viewer as any).is_platform_admin);
  const visible = !!r.public_profile_visible;
  const canView = visible || viewerId === requesterId || isAdmin;
  if (!canView) return res.status(404).json({ message: "Requester not found" });

  const commitmentsTotal = Number(r.commitments_total_count || 0);
  const canceled = Number(r.canceled_count || 0);
  const cancellation_rate = commitmentsTotal > 0 ? canceled / commitmentsTotal : null;


  const reviewsAgg = await pool.query(
    `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS count
     FROM visible_requester_reviews
     WHERE requester_user_id = $1`,
    [requesterId]
  );

  const recentReviews = await pool.query(
    `
    SELECT
      rr.id,
      rr.rating,
      rr.strengths,
      rr.improvements,
      rr.would_work_again,
      rr.created_at,
      rr.request_id,
      r.title AS request_title,
      COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS reviewer_name
    FROM visible_requester_reviews rr
    LEFT JOIN service_requests r ON r.id = rr.request_id
    LEFT JOIN users u ON u.id = rr.reviewer_user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE rr.requester_user_id = $1
    ORDER BY rr.created_at DESC
    LIMIT 3
    `,
    [requesterId]
  );

  const reviews_as_requester = {
    average_rating: Number(reviewsAgg.rows[0]?.avg_rating || 0),
    count: Number(reviewsAgg.rows[0]?.count || 0),
    recent: illustrateRows(recentReviews.rows)
  };

  return res.json({
    id: r.id,
    display_name: r.display_name || null,
    avatar_url: r.avatar_url || null,
    public_location: r.public_location || null,
    bio: r.bio || null,
    languages: r.languages || [],
    interaction_tags: r.interaction_styles || [],
    availability_windows: r.availability_windows || [],
    need_categories: r.need_categories || [],
    need_help_prompt: r.need_help_prompt || null,
    reviews_as_requester,

    logistics: {
      parking_available: typeof r.parking_available === "boolean" ? r.parking_available : null,
      elevator_available: typeof r.elevator_available === "boolean" ? r.elevator_available : null,
      stairs_present: typeof r.stairs_present === "boolean" ? r.stairs_present : null,
      pickup_vs_dropoff: r.pickup_vs_dropoff || null,
      time_flexibility: r.time_flexibility || null
    },
    household: {
      pets_at_home: typeof r.pets_at_home === "boolean" ? r.pets_at_home : null,
      smoke_free: typeof r.smoke_free === "boolean" ? r.smoke_free : null,
      accessibility_needs: r.accessibility_needs || null
    },
    safety_preferences: {
      meet_in_public_first: typeof r.meet_in_public_first === "boolean" ? r.meet_in_public_first : null,
      someone_else_present: typeof r.someone_else_present === "boolean" ? r.someone_else_present : null,
      mask_preferred: typeof r.mask_preferred === "boolean" ? r.mask_preferred : null
    },
    verification: {
      email_verified: !!r.email_verified,
      phone_verified: !!r.phone_verified,
      id_verification_status: r.verification_status || null
    },
    created_at: r.created_at,
    profile_updated_at: r.profile_updated_at || null,
    stats: {
      requests_count: Number(r.requests_count || 0),
      completed_commitments_count: Number(r.completed_count || 0),
      canceled_count: Number(r.canceled_count || 0),
      cancellation_rate,
      typical_response_time_seconds:
        r.median_reply_seconds === null || typeof r.median_reply_seconds === "undefined"
          ? null
          : Number(r.median_reply_seconds),
      thank_you_notes_count: Number(r.thank_you_notes_count || 0),
      endorsements_given_count: Number(r.endorsements_given_count || 0)
    }
  });
}));


app.post(
  "/v1/public/contact",
  wrap(async (req, res) => {
    // Honeypot: bots fill hidden fields; pretend success and store nothing.
    if (typeof req.body?.website === "string" && req.body.website.trim()) return res.status(202).json({ status: "accepted" });
    const parsed = ContactRequest.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const viewer = await optionalAuthedUser(req).catch(() => null);
    const ipHash = crypto.createHash("sha256").update(`${clientIp(req)}|${process.env.IP_HASH_SALT || "thankyou"}`).digest("hex");
    await pool.query(
      `INSERT INTO contact_messages (name, email, message, user_id, ip_hash) VALUES ($1, $2, $3, $4, $5)`,
      [parsed.data.name, parsed.data.email, parsed.data.message, viewer?.id ?? null, ipHash]
    );

    const supportEmail = process.env.SUPPORT_EMAIL;
    if (supportEmail) {
      await sendEmail({
        to: supportEmail,
        subject: `[ThankYou contact] ${parsed.data.name}`,
        text: `From: ${parsed.data.name} <${parsed.data.email}>\n\n${parsed.data.message}`
      }).catch(() => null);
    }
    return res.status(202).json({ status: "accepted" });
  })
);

}
