/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { requireRequesterUser } from "../../middleware/auth";
import { pool } from "../../lib/db";
import { discoverableSql } from "../requests/lifecycle";
import { wrap } from "../../lib/http";

/** Recent applications and threads for a requester's dashboard. */
export async function requesterActivity(user: { id: string }) {
    const recentApplicationsRes = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.request_id,
        r.title AS request_title,
        a.status,
        CASE WHEN a.status IN ('accepted','confirmed','completed') THEN a.message ELSE mask_contacts(a.message) END AS message,
        a.created_at,
        a.volunteer_user_id,
        NULL::text AS volunteer_email, -- pending/waitlisted only: never shown before acceptance
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS volunteer_display_name,
        p.avatar_url AS volunteer_avatar_url,
        COALESCE(p.public_location, p.location) AS volunteer_public_location
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      JOIN users u ON u.id = a.volunteer_user_id
      LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
      WHERE r.requester_user_id = $1
        AND a.status IN ('pending','waitlisted')
      ORDER BY a.created_at DESC
      LIMIT 5
      `,
      [user.id]
    );

    const recentThreadsRes = await pool.query(
      `
      WITH msgs AS (
        SELECT
          CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS peer_id,
          sender_user_id,
          recipient_user_id,
          request_id,
          application_id,
          body,
          created_at,
          read_at
        FROM direct_messages
        WHERE (sender_user_id = $1 OR (recipient_user_id = $1 AND status = 'sent'))
      ),
      agg AS (
        SELECT
          peer_id,
          request_id,
          application_id,
          MAX(created_at) AS last_at,
          COUNT(*) FILTER (WHERE recipient_user_id = $1 AND read_at IS NULL) AS unread_count
        FROM msgs
        GROUP BY peer_id, request_id, application_id
      ),
      last_msg AS (
        SELECT DISTINCT ON (peer_id, request_id, application_id)
          peer_id,
          request_id,
          application_id,
          body AS last_body,
          created_at AS last_at
        FROM msgs
        ORDER BY peer_id, request_id, application_id, created_at DESC
      )
      SELECT
        a.peer_id,
        a.request_id,
        a.application_id,
        r.title AS request_title,
        NULL::text AS peer_email, -- contact details stay in the app (4.6)
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS peer_display_name,
        p.avatar_url AS peer_avatar_url,
        COALESCE(p.public_location, p.location) AS peer_public_location,
        l.last_body,
        l.last_at,
        a.unread_count::int AS unread_count
      FROM agg a
      JOIN last_msg l ON l.peer_id = a.peer_id
        AND l.request_id IS NOT DISTINCT FROM a.request_id
        AND l.application_id IS NOT DISTINCT FROM a.application_id
      JOIN users u ON u.id = a.peer_id
      LEFT JOIN user_profiles p ON p.user_id = a.peer_id
      LEFT JOIN service_requests r ON r.id = a.request_id
      ORDER BY l.last_at DESC
      LIMIT 5
      `,
      [user.id]
    );

    return { recentApplications: recentApplicationsRes.rows, recentThreads: recentThreadsRes.rows };
}

/** Reviews received as a requester and given to volunteers. */
export async function requesterReputation(userId: string) {
  const r = await pool.query(
    `SELECT (SELECT COALESCE(AVG(rating), 0) FROM visible_requester_reviews WHERE requester_user_id = $1) AS avg_rating,
            (SELECT COUNT(*)::int FROM visible_requester_reviews WHERE requester_user_id = $1) AS received,
            (SELECT COUNT(*)::int FROM visible_volunteer_reviews WHERE reviewer_user_id = $1) AS given`,
    [userId]
  );
  const row = r.rows[0] ?? {};
  return { received: { average_rating: Number(row.avg_rating || 0), count: Number(row.received || 0) }, given: { count: Number(row.given || 0) } };
}

export function registerRequesterDashboardRoutes(app: Express) {


// Requester area: home scaffold + access control (Step 4.1)
app.get(
  "/v1/requester/home",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const statsRes = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM organizations) AS organizations,
         (SELECT COUNT(*)::int FROM service_requests r WHERE ${discoverableSql("r")}) AS opportunities,
         (SELECT COUNT(*)::int FROM public_pages) AS publicPages`
    );

    const howRes = await pool.query(
      "SELECT slug, title, body, updated_at FROM public_pages WHERE slug = $1",
      ["how-it-works"]
    );

    return res.json({
      user: { id: user.id, email: user.email, role: user.role },
      counts: statsRes.rows[0] || { organizations: 0, opportunities: 0, publicPages: 0 },
      howItWorks: howRes.rows[0] || null
    });
  })
);



// Requester area: dashboard summary (Step 4.2)
app.get(
  "/v1/requester/dashboard",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const [activeRequestsRes, pendingApplicationsRes, upcomingRes, unreadThreadsRes, activity, reputation] = await Promise.all([
      pool.query(
        "SELECT COUNT(*)::int AS c FROM service_requests WHERE requester_user_id = $1 AND status IN ('open','pending','filled','paused')",
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
           FROM request_applications a
           JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_user_id = $1 AND a.status = 'pending'`,
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
           FROM request_commitments c
           JOIN service_requests r ON r.id = c.request_id
          WHERE r.requester_user_id = $1
            AND c.status IN ('scheduled','confirmed')
            AND c.start_at > NOW()`,
        [user.id]
      ),
      pool.query(
        "SELECT COUNT(DISTINCT sender_user_id)::int AS c FROM direct_messages WHERE recipient_user_id = $1 AND read_at IS NULL AND status = 'sent'",
        [user.id]
      ),
      requesterActivity(user),
      requesterReputation(user.id)
    ]);

    return res.json({
      activeRequests: activeRequestsRes.rows[0]?.c ?? 0,
      pendingApplications: pendingApplicationsRes.rows[0]?.c ?? 0,
      upcoming: upcomingRes.rows[0]?.c ?? 0,
      unreadThreads: unreadThreadsRes.rows[0]?.c ?? 0,
      // Activity and reputation ride along so the dashboard page needs one backend call.
      activity,
      reputation
    });
  })
);




// Requester area: quick access activity (new applications + recent messages)
app.get(
  "/v1/requester/activity",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;
    return res.json(await requesterActivity(user));
  })
);
}
