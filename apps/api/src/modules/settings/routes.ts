import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireAuthedUser } from "../../middleware/auth";
import { getNotificationLastSeen } from "./helpers";

export function registerSettingsRoutes(app: Express) {

app.get(
  "/v1/settings/notifications/unseen-count",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const lastSeen = await getNotificationLastSeen(user.id);

    const counts = await pool.query(
      `
      SELECT COUNT(1)::int AS c FROM (
        SELECT dm.created_at AS created_at
        FROM direct_messages dm
        WHERE dm.recipient_user_id = $1 AND dm.status = 'sent'

        UNION ALL

        SELECT a.created_at AS created_at
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE $2 = 'requester' AND r.requester_user_id = $1

        UNION ALL

        SELECT a.updated_at AS created_at
        FROM request_applications a
        WHERE $2 = 'volunteer'
          AND a.volunteer_user_id = $1
          AND a.updated_at IS NOT NULL
          AND a.updated_at > a.created_at
          AND COALESCE(a.status, 'pending') <> 'pending'

        UNION ALL

        SELECT vr.created_at AS created_at
        FROM visible_volunteer_reviews vr
        WHERE $2 = 'volunteer' AND vr.volunteer_user_id = $1

        UNION ALL

        SELECT rr.created_at AS created_at
        FROM visible_requester_reviews rr
        WHERE $2 = 'requester' AND rr.requester_user_id = $1
      ) n
      WHERE n.created_at > $3
      `,
      [user.id, user.role, lastSeen.toISOString()]
    );

    return res.json({ unseen_count: counts.rows?.[0]?.c ?? 0 });
  })
);

// ------------------------------------------------------------
// Shared Settings (All logged-in users): Privacy & Safety
// ------------------------------------------------------------

app.get(
  "/v1/settings/privacy-safety",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const existing = await pool.query(
      `
      SELECT
        public_profile_visible,
        messaging_permission,
        updated_at
      FROM user_privacy_settings
      WHERE user_id = $1
      `,
      [user.id]
    );

    if ((existing.rowCount ?? 0) === 0) {
      const ins = await pool.query(
        `
        INSERT INTO user_privacy_settings (user_id)
        VALUES ($1)
        RETURNING public_profile_visible, messaging_permission, updated_at
        `,
        [user.id]
      );
      return res.json(ins.rows[0]);
    }

    return res.json(existing.rows[0]);
  })
);

app.post(
  "/v1/settings/privacy-safety",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const schema = z.object({
      public_profile_visible: z.boolean(),
      messaging_permission: z.enum(["anyone", "verified_only", "no_one"])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const upsert = await pool.query(
      `
      INSERT INTO user_privacy_settings (user_id, public_profile_visible, messaging_permission, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        public_profile_visible = EXCLUDED.public_profile_visible,
        messaging_permission = EXCLUDED.messaging_permission,
        updated_at = NOW()
      RETURNING public_profile_visible, messaging_permission, updated_at
      `,
      [user.id, parsed.data.public_profile_visible, parsed.data.messaging_permission]
    );

    return res.json(upsert.rows[0]);
  })
);

app.get(
  "/v1/settings/reportables",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const peersRes = await pool.query(
      `
      WITH dm_peers AS (
        SELECT DISTINCT
          CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS peer_id
        FROM direct_messages
        WHERE sender_user_id = $1 OR recipient_user_id = $1
      ),
      app_peers AS (
        -- Peers from applications (volunteer ↔ requester)
        SELECT DISTINCT r.requester_user_id AS peer_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.volunteer_user_id = $1

        UNION

        SELECT DISTINCT a.volunteer_user_id AS peer_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE r.requester_user_id = $1
      ),
      peers AS (
        SELECT peer_id FROM dm_peers
        UNION
        SELECT peer_id FROM app_peers
      )
      SELECT
        u.id,
        u.email,
        COALESCE(NULLIF(p.display_name, ''), NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Member') AS display_name,
        p.avatar_url,
        COALESCE(p.public_location, p.location) AS public_location
      FROM peers x
      JOIN users u ON u.id = x.peer_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id <> $1
      ORDER BY display_name ASC NULLS LAST, email ASC
      LIMIT 100
      `,
      [user.id]
    );

    const requestsRes = await pool.query(
      `
      WITH as_requester AS (
        SELECT r.id, r.title, r.created_at, 'requester'::text AS role
        FROM service_requests r
        WHERE r.requester_user_id = $1
      ),
      as_volunteer AS (
        SELECT DISTINCT r.id, r.title, r.created_at, 'volunteer'::text AS role
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.volunteer_user_id = $1
      ),
      all_reqs AS (
        SELECT * FROM as_requester
        UNION
        SELECT * FROM as_volunteer
      )
      SELECT
        r.id,
        r.title,
        r.created_at,
        r.role,
        org.name AS organization_name
      FROM all_reqs r
      LEFT JOIN service_requests sr ON sr.id = r.id
      LEFT JOIN organizations org ON org.slug = sr.requester_org_slug
      ORDER BY r.created_at DESC
      LIMIT 100
      `,
      [user.id]
    );

    return res.json({
      peers: peersRes.rows,
      requests: requestsRes.rows
    });
  })
);

app.get(
  "/v1/settings/blocked-users/count",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;
    const r = await pool.query("SELECT COUNT(*)::int AS c FROM user_blocks WHERE blocker_user_id = $1", [user.id]);
    return res.json({ blocked_count: r.rows[0]?.c ?? 0 });
  })
);

app.get(
  "/v1/settings/reports/count",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;
    const r = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('submitted','in_review'))::int AS open
         FROM user_reports WHERE reporter_user_id = $1`,
      [user.id]
    );
    return res.json({ reports_count: r.rows[0]?.total ?? 0, reports_open: r.rows[0]?.open ?? 0 });
  })
);

app.get(
  "/v1/settings/blocked-users",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        b.blocked_user_id,
        b.reason,
        b.created_at AS blocked_at,
        COALESCE(NULLIF(p.display_name, ''), split_part(COALESCE(p.full_name, ''), ' ', 1), 'Member') AS blocked_display_name,
        p.avatar_url AS blocked_avatar_url,
        p.public_location AS blocked_public_location
      FROM user_blocks b
      JOIN users u ON u.id = b.blocked_user_id
      LEFT JOIN user_profiles p ON p.user_id = b.blocked_user_id
      WHERE b.blocker_user_id = $1
      ORDER BY b.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.post(
  "/v1/settings/blocked-users",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const schema = z.object({
      blocked_user_id: z.string().uuid().optional(),
      email: z.string().email().optional(),
      reason: z.string().max(5000).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const reason = (parsed.data.reason || "").trim() || null;

    let blockedUserId = parsed.data.blocked_user_id ?? null;

    if (!blockedUserId && parsed.data.email) {
      const email = parsed.data.email.toLowerCase().trim();
      const u = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
      if (u.rowCount === 0) return res.status(404).json({ message: "User not found" });
      blockedUserId = String(u.rows[0].id);
    }

    if (!blockedUserId) return res.status(400).json({ message: "Choose a user or provide an email." });
    if (blockedUserId === user.id) return res.status(400).json({ message: "You can't block yourself." });

    const insert = await pool.query(
      `
      INSERT INTO user_blocks (blocker_user_id, blocked_user_id, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (blocker_user_id, blocked_user_id)
      DO UPDATE SET reason = EXCLUDED.reason
      RETURNING blocked_user_id, reason, created_at AS blocked_at
      `,
      [user.id, blockedUserId, reason]
    );

    return res.status(201).json(insert.rows[0]);
  })
);

app.delete(
  "/v1/settings/blocked-users/:blockedUserId",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const parsed = z.string().uuid().safeParse(req.params.blockedUserId);
    if (!parsed.success) return res.status(400).json({ message: "Invalid blocked user id" });

    await pool.query("DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2", [user.id, parsed.data]);

    return res.json({ ok: true });
  })
);

app.get(
  "/v1/settings/reports",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        r.id,
        r.category,
        r.details,
        r.status,
        r.created_at,
        r.updated_at,
        r.resolved_at,

        r.target_user_id,
        NULL::text AS target_user_email, -- reporters see display names, not emails
        COALESCE(NULLIF(tup.display_name, ''), NULLIF(split_part(COALESCE(tup.full_name, ''), ' ', 1), ''), 'Member') AS target_user_display_name,

        r.target_request_id,
        sr.title AS target_request_title,
        org.name AS target_request_org_name
      FROM user_reports r
      LEFT JOIN users tu ON tu.id = r.target_user_id
      LEFT JOIN user_profiles tup ON tup.user_id = r.target_user_id
      LEFT JOIN service_requests sr ON sr.id = r.target_request_id
      LEFT JOIN organizations org ON org.slug = sr.requester_org_slug
      WHERE r.reporter_user_id = $1
      ORDER BY r.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.post(
  "/v1/settings/reports",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const schema = z.object({
      target_type: z.enum(["user", "request", "other"]),
      target_user_id: z.string().uuid().optional(),
      target_request_id: z.string().uuid().optional(),
      category: z.enum(["harassment", "spam", "scam", "safety", "hate", "sexual", "other"]),
      details: z.string().min(10).max(10000)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const targetType = parsed.data.target_type;

    const targetUserId = targetType === "user" ? parsed.data.target_user_id ?? null : null;
    const targetRequestId = targetType === "request" ? parsed.data.target_request_id ?? null : null;

    if (targetType === "user" && !targetUserId) {
      return res.status(400).json({ message: "Choose a user to report." });
    }
    if (targetType === "request" && !targetRequestId) {
      return res.status(400).json({ message: "Choose a request to report." });
    }

    if (targetUserId) {
      const u = await pool.query("SELECT id FROM users WHERE id = $1", [targetUserId]);
      if (u.rowCount === 0) return res.status(404).json({ message: "Target user not found" });
      if (String(targetUserId) === user.id) return res.status(400).json({ message: "You can't report yourself." });
    }

    if (targetRequestId) {
      const r = await pool.query("SELECT id FROM service_requests WHERE id = $1", [targetRequestId]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Target request not found" });
    }

    const insert = await pool.query(
      `
      INSERT INTO user_reports (reporter_user_id, target_user_id, target_request_id, category, details, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'submitted', NOW(), NOW())
      RETURNING id, category, details, status, created_at, updated_at, target_user_id, target_request_id
      `,
      [user.id, targetUserId, targetRequestId, parsed.data.category, parsed.data.details]
    );

    return res.status(201).json(insert.rows[0]);
  })
);
}
