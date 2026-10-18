import { can, type PolicyUser } from "../../lib/policy";
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { coarseLocationFromText } from "../../lib/redaction";
import { getOptionalAuthedUser, requireAuthedUser } from "../../middleware/auth";
import { SHARE_REPORTS_AUTO_REVOKE_THRESHOLD, buildLoginCtaHref, createShareLinkHandler, hashIp } from "./helpers";

export function registerShareRoutes(app: Express) {

app.post("/v1/shares", createShareLinkHandler);

app.get("/v1/shares/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Missing token" });

  const linkRes = await pool.query(
    `
      SELECT id, token, share_type, target_ref, destination_path, visibility, expires_at, revoked_at, created_by_user_id, moderation_state,
             (SELECT COUNT(*)::int FROM share_reports r WHERE r.share_link_id = share_links.id AND r.status <> 'dismissed') AS report_count
      FROM share_links
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const link = linkRes.rows[0];

  const isExpired = Boolean(link.expires_at) && new Date(link.expires_at).getTime() <= Date.now();
  const isRevoked = Boolean(link.revoked_at);

  // If private: only creator (or admin) can view anything (even preview).
  const visibility = String(link.visibility || "public");
  const shareType = String(link.share_type || "");
  const targetRef = String(link.target_ref || "");

  const user = await getOptionalAuthedUser(req);

  if (visibility === "private") {
    const isOwner = Boolean(user) && String(user?.id) === String(link.created_by_user_id);
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
  let timeWindow: { needed_by: string } | null = null;
  let verificationStatus: string | null = null;
  let imageUrl: string | null = null;
  let ctaLabel = "Open";
  // Where the button goes: the shared page itself (never back to this share page).
  const dest = String(link.destination_path || "/");
  let ctaHref = dest.startsWith("/") && !dest.startsWith("//") ? dest : "/";
  if (shareType === "SERVICE_REQUEST" || shareType === "OPPORTUNITY") ctaHref = `/opportunities/${encodeURIComponent(targetRef)}`;

  try {
    if (shareType === "PUBLIC_PAGE") {
      const rowRes = await pool.query(`SELECT title, body FROM public_pages WHERE slug = $1`, [targetRef]);
      const row = rowRes.rows[0];
      title = String(row?.title || "Public page");
      const body = String(row?.body || "");
      summary = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
      ctaLabel = "Open page";
    } else if (shareType === "IMPACT_STORY") {
      const rowRes = await pool.query(
        `SELECT title, excerpt, cover_image_url FROM impact_stories WHERE slug = $1`,
        [targetRef]
      );
      const row = rowRes.rows[0];
      title = String(row?.title || "Impact story");
      summary = String(row?.excerpt || "").slice(0, 180);
      imageUrl = row?.cover_image_url ? String(row.cover_image_url) : null;
      ctaLabel = "Read story";
    } else if (shareType === "ORGANIZATION") {
      const rowRes = await pool.query(
        `SELECT name, summary, location, verification_status, verified_at FROM organizations WHERE slug = $1`,
        [targetRef]
      );
      const row = rowRes.rows[0];
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
          SELECT r.title, r.description, r.location_text, r.public_area, r.mode, r.needed_by, r.starts_at, r.requester_org_slug,
                 org.verification_status, org.verified_at, org.location AS org_location
          FROM service_requests r
          LEFT JOIN organizations org ON org.slug = r.requester_org_slug
          WHERE r.id = $1
          LIMIT 1
        `,
        [targetRef]
      );

      const row = rowRes.rows[0];
      title = String(row?.title || "Service request");
      summary = String(row?.description || "").replace(/\s+/g, " ").trim().slice(0, 180);

      // Coarse location: the opportunity's own public area (never the street address or the org's city).
      coarseLocation = row?.mode === "remote" ? "Remote" : row?.public_area ? String(row.public_area) : coarseLocationFromText(row?.location_text);

      const when = row?.starts_at || row?.needed_by;
      if (when) {
        timeWindow = { needed_by: new Date(when).toISOString() };
      }

      const status = row?.verification_status ? String(row.verification_status) : null;
      const verifiedAt = row?.verified_at ? String(row.verified_at) : null;
      verificationStatus = verifiedAt ? "verified" : status;

      ctaLabel = "Volunteer / Apply";
    } else if (shareType === "INVITE") {
      title = "You're invited to ThankYou";
      summary = "Find volunteer opportunities near you or online, or get a hand from your neighbors. It's free.";
      ctaLabel = "Create a free account";
      ctaHref = "/signup";
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
    share_type: shareType,
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
    // Viewers are warned when people have reported this link (it stays up until a moderator acts).
    moderation_state: String(link.moderation_state || "clean"),
    report_count: Number(link.report_count || 0),
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

  const linkId = (linkRes.rows[0]).id;

  const user = await getOptionalAuthedUser(req);
  const ipHashVal = hashIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const referer = String(req.headers["referer"] || "");

  await pool.query(
    `
      INSERT INTO share_events (share_link_id, event_type, actor_user_id, ip_hash, user_agent, referer)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [linkId, parsed.data.event_type, user ? user.id : null, ipHashVal, userAgent || null, referer || null]
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

  const linkRes = await pool.query(`SELECT id, revoked_at FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = String(linkRes.rows[0].id);
  const linkRevokedAt = linkRes.rows[0].revoked_at as string | null;
  const user = await getOptionalAuthedUser(req);
  const reporterId = user ? String((user as { id: string }).id) : null;
  const ipHash = hashIp(req);

  // One report per person (account or network address) per link.
  const dupe = await pool.query(
    "SELECT 1 FROM share_reports WHERE share_link_id = $1 AND (($2::uuid IS NOT NULL AND reporter_user_id = $2::uuid) OR ($2::uuid IS NULL AND reporter_ip_hash = $3)) LIMIT 1",
    [linkId, reporterId, ipHash]
  );
  if (dupe.rowCount) return res.json({ ok: true });

  await pool.query(
    "INSERT INTO share_reports (share_link_id, reason, details, reporter_user_id, reporter_ip_hash) VALUES ($1, $2, $3, $4, $5)",
    [linkId, parsed.data.reason, parsed.data.details || null, reporterId, ipHash]
  );
  await pool.query("UPDATE share_links SET moderation_state = 'reported' WHERE id = $1 AND moderation_state = 'clean'", [linkId]);

  // Auto-revoke after N different people report it (one person reporting repeatedly doesn't count).
  const countRes = await pool.query(
    "SELECT COUNT(DISTINCT COALESCE(reporter_user_id::text, reporter_ip_hash))::int AS c FROM share_reports WHERE share_link_id = $1",
    [linkId]
  );
  const reportCount = Number(countRes.rows[0]?.c || 0);
  if (!linkRevokedAt && reportCount >= SHARE_REPORTS_AUTO_REVOKE_THRESHOLD) {
    await pool.query("UPDATE share_links SET revoked_at = NOW(), revoked_reason = 'auto_reports' WHERE id = $1 AND revoked_at IS NULL", [linkId]);
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

  const row = linkRes.rows[0];
  const isOwner = String(row.created_by_user_id) === String(user.id);
  const isAdmin = can(user as PolicyUser, "platform:moderate");

  if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

  await pool.query(`UPDATE share_links SET revoked_at = NOW() WHERE id = $1`, [row.id]);
  return res.json({ ok: true });
});

// The /v1/share/* duplicates were removed; use /v1/shares/*.
}
