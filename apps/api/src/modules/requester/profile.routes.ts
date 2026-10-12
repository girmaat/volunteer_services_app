import type { Express } from "express";
import { z } from "zod";
import { setProfile } from "../../auth/handlers";
import { requireRequesterUser } from "../../middleware/auth";
import { illustrateRows } from "../volunteer/helpers";
import { pool } from "../../lib/db";
import { requesterReputation } from "./dashboard.routes";
import { wrap } from "../../lib/http";

export function registerRequesterProfileRoutes(app: Express) {



// Requester area: profile (shared schema, requester-specific fields)
app.get(
  "/v1/requester/profile",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const prof = await pool.query(
      `SELECT
         full_name,
         display_name,
         avatar_url,
         phone,
         public_location,
         location,
         bio,
         languages,
         interaction_styles,
         availability_windows,

         need_categories,
         need_help_prompt,

         parking_available,
         elevator_available,
         stairs_present,
         pickup_vs_dropoff,
         time_flexibility,

         pets_at_home,
         smoke_free,
         accessibility_needs,

         meet_in_public_first,
         someone_else_present,
         mask_preferred,

         updated_at
       FROM user_profiles
       WHERE user_id = $1`,
      [user.id]
    );

    const statsRow = await pool.query(
      `
      SELECT
        COALESCE((SELECT COUNT(*)::int
          FROM request_commitments c
          JOIN service_requests sr ON sr.id = c.request_id
          WHERE sr.requester_user_id = $1
        ), 0) AS commitments_total_count,
        COALESCE((SELECT COUNT(*)::int
          FROM request_commitments c
          JOIN service_requests sr ON sr.id = c.request_id
          WHERE sr.requester_user_id = $1 AND c.status = 'completed'
        ), 0) AS completed_count,
        COALESCE((SELECT COUNT(*)::int
          FROM request_commitments c
          JOIN service_requests sr ON sr.id = c.request_id
          WHERE sr.requester_user_id = $1 AND c.status = 'canceled'
        ), 0) AS canceled_count,
        COALESCE((SELECT COUNT(*)::int FROM visible_volunteer_reviews vr WHERE vr.reviewer_user_id = $1), 0) AS thank_you_notes_count,
        (
          SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)
          FROM (
            SELECT EXTRACT(EPOCH FROM (reply.created_at - msg.created_at))::float AS seconds
            FROM direct_messages msg
            JOIN LATERAL (
              SELECT created_at
              FROM direct_messages reply
              WHERE reply.sender_user_id = $1
                AND reply.recipient_user_id = msg.sender_user_id
                AND reply.created_at > msg.created_at
              ORDER BY reply.created_at ASC
              LIMIT 1
            ) reply ON TRUE
            WHERE msg.recipient_user_id = $1
              AND msg.sender_user_id <> $1
              AND msg.created_at >= NOW() - INTERVAL '90 days'
              AND reply.created_at <= msg.created_at + INTERVAL '7 days'
          ) deltas
        ) AS median_reply_seconds
      `,
      [user.id]
    );

    const r = statsRow.rows[0] || {};
    const commitmentsTotal = Number(r.commitments_total_count || 0);
    const canceled = Number(r.canceled_count || 0);
    const cancellation_rate = commitmentsTotal > 0 ? canceled / commitmentsTotal : null;

    return res.json({
      user: { id: user.id, email: user.email, role: user.role },
      verification: {
        email_verified: !!user.email_verified_at,
        phone_verified: !!user.phone_verified_at,
        id_verification_status: user.verification_status || null
      },
      profile: prof.rows[0] || null,
      trust: {
        completed_commitments_count: Number(r.completed_count || 0),
        cancellation_rate,
        typical_response_time_seconds:
          r.median_reply_seconds === null || typeof r.median_reply_seconds === "undefined"
            ? null
            : Number(r.median_reply_seconds),
        thank_you_notes_count: Number(r.thank_you_notes_count || 0)
      }
    });
  })
);



app.post(
  "/v1/requester/profile",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    // Full name is required for requester profiles.
    const schema = z.object({ fullName: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Full name is required" });
    }

    // Reuse onboarding profile handler to persist profile fields.
    return setProfile(pool, req, res);
  })
);




// Requester: reputation summary (reviews received as requester + reviews given to volunteers)
app.get("/v1/requester/reputation/summary", wrap(async (req, res) => {
  const user = await requireRequesterUser(req, res);
  if (!user) return;
  return res.json(await requesterReputation(user.id));
}));



// Requester: reviews received (as requester)
app.get("/v1/requester/history/reviews", wrap(async (req, res) => {
  const user = await requireRequesterUser(req, res);
  if (!user) return;

  const rows = await pool.query(
    `
    SELECT
      rr.id,
      rr.rating,
      rr.strengths,
      rr.improvements,
      rr.would_work_again,
      rr.created_at,
      rr.request_id,
      rr.request_application_id,
      r.title AS request_title,
      COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS reviewer_name
    FROM visible_requester_reviews rr
    LEFT JOIN service_requests r ON r.id = rr.request_id
    LEFT JOIN users u ON u.id = rr.reviewer_user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE rr.requester_user_id = $1
    ORDER BY rr.created_at DESC
    `,
    [user.id]
  );

  const avg = rows.rows.length
    ? rows.rows.reduce((s: number, r) => s + Number(r.rating || 0), 0) / rows.rows.length
    : 0;

  return res.json({ average_rating: avg, count: rows.rows.length, reviews: illustrateRows(rows.rows) });
}));



// Requester: reviews given (to volunteers)
app.get("/v1/requester/history/reviews-given", wrap(async (req, res) => {
  const user = await requireRequesterUser(req, res);
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
      COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS volunteer_name
    FROM visible_volunteer_reviews vr
    LEFT JOIN service_requests r ON r.id = vr.request_id
    LEFT JOIN users u ON u.id = vr.volunteer_user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE vr.reviewer_user_id = $1
    ORDER BY vr.created_at DESC
    `,
    [user.id]
  );

  return res.json({ count: rows.rows.length, reviews: illustrateRows(rows.rows) });
}));
}
