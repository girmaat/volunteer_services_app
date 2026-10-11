import { can, type PolicyUser } from "../../lib/policy";
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { coarseLocationFromText } from "../../lib/redaction";
import { getOptionalAuthedUser, requireAuthedUser } from "../../middleware/auth";
import { SHARE_REPORTS_AUTO_REVOKE_THRESHOLD, buildLoginCtaHref, createShareLinkHandler, hashIp, requiresAuthByType } from "./helpers";

export function registerShareRoutes(app: Express) {

app.post("/v1/shares", createShareLinkHandler);

app.post("/v1/share/links", createShareLinkHandler);


app.get("/v1/shares/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Missing token" });

  const linkRes = await pool.query(
    `
      SELECT id, token, share_type, target_ref, destination_path, visibility, expires_at, revoked_at, created_by_user_id
      FROM share_links
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const link = linkRes.rows[0] as any;

  const isExpired = Boolean(link.expires_at) && new Date(link.expires_at).getTime() <= Date.now();
  const isRevoked = Boolean(link.revoked_at);

  // If private: only creator (or admin) can view anything (even preview).
  const visibility = String(link.visibility || "public");
  const shareType = String(link.share_type || "");
  const targetRef = String(link.target_ref || "");

  const user = await getOptionalAuthedUser(req);

  if (visibility === "private") {
    const isOwner = Boolean(user) && String((user as any).id) === String(link.created_by_user_id);
    const isAdmin = can(user as PolicyUser | null, "platform:moderate");
    if (!isOwner && !isAdmin) {
      // Don't disclose existence for private shares.
      return res.status(404).json({ message: "Not found" });
    }
  }

  const requiresAuthByType =
    shareType === "ORGANIZATION" || shareType === "OPPORTUNITY" || shareType === "SERVICE_REQUEST";

  const requiresLogin =
    visibility === "logged_in_only" || visibility === "private" || requiresAuthByType;

  const viewerCanViewDetails =
    !isExpired &&
    !isRevoked &&
    (visibility === "public" || visibility === "link_only" || (visibility === "logged_in_only" && Boolean(user)) || visibility === "private");

  // Minimal response when not allowed (safe for OG + crawlers)
  if (!viewerCanViewDetails) {
    const title = isExpired ? "Link expired" : isRevoked ? "Link revoked" : "ThankYou shared link";
    const summary = isExpired
      ? "This shared link has expired."
      : isRevoked
        ? "This shared link has been revoked."
        : "Sign in to view details.";

    return res.json({
      token: link.token,
      title,
      summary,
      cta_label: "Log in to view",
      cta_href: buildLoginCtaHref(link.token),
      coarse_location: null,
      time_window: null,
      verification_status: null,
      image_url: null,
      requires_login: true,
      is_expired: isExpired,
      is_revoked: isRevoked,
      viewer_can_view_details: false
    });
  }

  let title = "Shared link";
  let summary = "";
  let coarseLocation: string | null = null;
  let timeWindow: any = null;
  let verificationStatus: string | null = null;
  let imageUrl: string | null = null;
  let ctaLabel = "Open";
  const ctaHref = `/s/${encodeURIComponent(link.token)}`;

  try {
    if (shareType === "PUBLIC_PAGE") {
      const rowRes = await pool.query(`SELECT title, body FROM public_pages WHERE slug = $1`, [targetRef]);
      const row = rowRes.rows[0] as any;
      title = String(row?.title || "Public page");
      const body = String(row?.body || "");
      summary = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
      ctaLabel = "Open page";
    } else if (shareType === "IMPACT_STORY") {
      const rowRes = await pool.query(
        `SELECT title, excerpt, cover_image_url FROM impact_stories WHERE slug = $1`,
        [targetRef]
      );
      const row = rowRes.rows[0] as any;
      title = String(row?.title || "Impact story");
      summary = String(row?.excerpt || "").slice(0, 180);
      imageUrl = row?.cover_image_url ? String(row.cover_image_url) : null;
      ctaLabel = "Read story";
    } else if (shareType === "ORGANIZATION") {
      const rowRes = await pool.query(
        `SELECT name, summary, location, verification_status, verified_at FROM organizations WHERE slug = $1`,
        [targetRef]
      );
      const row = rowRes.rows[0] as any;
      title = String(row?.name || "Organization");
      summary = String(row?.summary || "").slice(0, 180);
      coarseLocation = String(row?.location || "");
      const status = row?.verification_status ? String(row.verification_status) : null;
      const verifiedAt = row?.verified_at ? String(row.verified_at) : null;
      verificationStatus = verifiedAt ? "verified" : status;
      ctaLabel = "View organization";
    } else if (shareType === "SERVICE_REQUEST" || shareType === "OPPORTUNITY") {
      // Primary data source: service_requests (UUID ids). This is used for both volunteer opportunities and requester posts.
      const rowRes = await pool.query(
        `
          SELECT r.title, r.description, r.location_text, r.needed_by, r.requester_org_slug,
                 org.verification_status, org.verified_at, org.location AS org_location
          FROM service_requests r
          LEFT JOIN organizations org ON org.slug = r.requester_org_slug
          WHERE r.id = $1
          LIMIT 1
        `,
        [targetRef]
      );

      const row = rowRes.rows[0] as any;
      title = String(row?.title || "Service request");
      summary = String(row?.description || "").replace(/\s+/g, " ").trim().slice(0, 180);

      // Coarse location: prefer org location if present; otherwise sanitize free-form location_text.
      coarseLocation = row?.org_location ? String(row.org_location) : coarseLocationFromText(row?.location_text);

      if (row?.needed_by) {
        timeWindow = { needed_by: String(row.needed_by) };
      }

      const status = row?.verification_status ? String(row.verification_status) : null;
      const verifiedAt = row?.verified_at ? String(row.verified_at) : null;
      verificationStatus = verifiedAt ? "verified" : status;

      ctaLabel = "Volunteer / Apply";
    } else {
      // Fallback
      title = "Shared link";
      summary = "";
      ctaLabel = "Open";
    }
  } catch {
    // Swallow preview errors; fall back to generic.
  }

  return res.json({
    token: link.token,
    title,
    summary,
    cta_label: ctaLabel,
    cta_href: ctaHref,
    coarse_location: coarseLocation,
    time_window: timeWindow,
    verification_status: verificationStatus,
    image_url: imageUrl,
    requires_login: requiresLogin,
    is_expired: isExpired,
    is_revoked: isRevoked,
    viewer_can_view_details: true
  });
});


app.post("/v1/shares/:token/events", async (req, res) => {
  const token = String(req.params.token || "").trim();
  const parsed = z
    .object({
      event_type: z.enum(["view","copy","sms","email","whatsapp","facebook","x","linkedin","qr","native_share","resolve"])
    })
    .safeParse(req.body);

  if (!token) return res.status(400).json({ message: "Missing token" });
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const linkRes = await pool.query(`SELECT id, created_by_user_id, revoked_at FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = (linkRes.rows[0] as any).id;

  const user = await getOptionalAuthedUser(req);
  const ipHashVal = hashIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const referer = String(req.headers["referer"] || "");

  await pool.query(
    `
      INSERT INTO share_events (share_link_id, event_type, actor_user_id, ip_hash, user_agent, referer)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [linkId, parsed.data.event_type, user ? (user as any).id : null, ipHashVal, userAgent || null, referer || null]
  );

  return res.json({ ok: true });
});


app.post("/v1/shares/:token/report", async (req, res) => {
  const token = String(req.params.token || "").trim();

  const parsed = z
    .object({
      reason: z.string().min(1).max(100),
      details: z.string().max(2000).optional()
    })
    .safeParse(req.body);

  if (!token) return res.status(400).json({ message: "Missing token" });
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const linkRes = await pool.query(`SELECT id FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = (linkRes.rows[0] as any).id;
  const linkRevokedAt = (linkRes.rows[0] as any).revoked_at as string | null;
  const user = await getOptionalAuthedUser(req);

  await pool.query(
    `
      INSERT INTO share_reports (share_link_id, reason, details, reporter_user_id)
      VALUES ($1, $2, $3, $4)
    `,
    [linkId, parsed.data.reason, parsed.data.details || null, user ? (user as any).id : null]
  );

  // Policy: auto-revoke a link after N reports
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM share_reports WHERE share_link_id = $1`, [linkId]);
  const reportCount = Number((countRes.rows[0] as any)?.c || 0);
  if (!linkRevokedAt && reportCount >= SHARE_REPORTS_AUTO_REVOKE_THRESHOLD) {
    await pool.query(`UPDATE share_links SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [linkId]);
  }

  return res.json({ ok: true });
});


app.post("/v1/shares/:token/revoke", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Missing token" });

  const user = await requireAuthedUser(req, res);
  if (!user) return;

  const linkRes = await pool.query(
    `SELECT id, created_by_user_id FROM share_links WHERE token = $1 LIMIT 1`,
    [token]
  );

  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const row = linkRes.rows[0] as any;
  const isOwner = String(row.created_by_user_id) === String(user.id);
  const isAdmin = can(user as PolicyUser, "platform:moderate");

  if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

  await pool.query(`UPDATE share_links SET revoked_at = NOW() WHERE id = $1`, [row.id]);
  return res.json({ ok: true });
});



app.get("/v1/share/resolve/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Invalid token" });

  const rows = await pool.query(
    `
      SELECT id, token, share_type, target_ref, destination_path, visibility, created_by_user_id, expires_at, revoked_at
      FROM share_links
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const link = rows.rows[0] as any;
  if (link.revoked_at) return res.status(404).json({ message: "Not found" });
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return res.status(404).json({ message: "Not found" });

  const shareType = String(link.share_type);
  const visibility = String(link.visibility);
  const needsAuth = requiresAuthByType(shareType) || visibility === "logged_in_only" || visibility === "private";

  const user = await getOptionalAuthedUser(req);

  if (needsAuth && !user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  if (visibility === "private") {
    const isOwner = user && String((user as any).id) === String(link.created_by_user_id);
    const isAdmin = user && Boolean((user as any).is_platform_admin);
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });
  }

  // Log resolve event (privacy-preserving)
  const ipHashVal = hashIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const referer = String(req.headers["referer"] || "");
  await pool.query(
    `
      INSERT INTO share_events (share_link_id, event_type, actor_user_id, ip_hash, user_agent, referer)
      VALUES ($1, 'resolve', $2, $3, $4, $5)
    `,
    [link.id, user ? (user as any).id : null, ipHashVal, userAgent || null, referer || null]
  );

  await pool.query(
    `
      UPDATE share_links
      SET resolve_count = resolve_count + 1, last_resolved_at = NOW()
      WHERE id = $1
    `,
    [link.id]
  );

  return res.json({
    destination_path: link.destination_path,
    requires_auth: needsAuth,
    visibility: link.visibility,
    share_type: link.share_type,
    target_ref: link.target_ref
  });
});


app.post("/v1/share/events", async (req, res) => {
  const parsed = z
    .object({
      token: z.string().min(1),
      event_type: z.enum(["view","copy","sms","email","whatsapp","facebook","x","linkedin","qr","native_share","resolve"])
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const token = String(parsed.data.token).trim();
  const rows = await pool.query(`SELECT id FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = rows.rows[0].id;
  const user = await getOptionalAuthedUser(req);
  const ipHashVal = hashIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const referer = String(req.headers["referer"] || "");

  await pool.query(
    `
      INSERT INTO share_events (share_link_id, event_type, actor_user_id, ip_hash, user_agent, referer)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [linkId, parsed.data.event_type, user ? (user as any).id : null, ipHashVal, userAgent || null, referer || null]
  );

  return res.json({ ok: true });
});


app.post("/v1/share/report/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Invalid token" });

  const parsed = z
    .object({
      reason: z.string().min(1).max(200),
      details: z.string().max(2000).optional()
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const rows = await pool.query(`SELECT id FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = rows.rows[0].id;
  const user = await getOptionalAuthedUser(req);

  await pool.query(
    `
      INSERT INTO share_reports (share_link_id, reporter_user_id, reason, details)
      VALUES ($1, $2, $3, $4)
    `,
    [linkId, user ? (user as any).id : null, parsed.data.reason, parsed.data.details || null]
  );

  return res.json({ ok: true });
});
}
