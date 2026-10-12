import type { Express } from "express";
import { requireRequesterUser } from "../../middleware/auth";
import { pool } from "../../lib/db";
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
        CASE WHEN a.status IN ('accepted','confirmed','completed') THEN a.message ELSE mask_contacts(a.message) END AS message,
        a.created_at,
        a.updated_at,
        a.volunteer_user_id,
        NULL::text AS volunteer_email, -- pending/waitlisted only: never shown before acceptance
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

}
