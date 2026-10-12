import { clientIp } from "../../lib/clientIp";
import { z } from "zod";
import crypto from "crypto";
import type express from "express";
import { pool } from "../../lib/db";
import { requireAuthedUser } from "../../middleware/auth";

export function randomToken() {
  // 16 bytes => 22 chars base64url (no padding)
  return crypto.randomBytes(16).toString("base64url");
}

export function normalizeVisibility(v: any) {
  const raw = String(v || "").trim().toLowerCase();
  if (raw === "public" || raw === "link_only" || raw === "logged_in_only" || raw === "private") return raw;
  return "link_only";
}

export async function isActiveOrgMember(userId: string, orgSlug: string) {
  const rows = await pool.query(
    `SELECT 1 FROM organization_members WHERE user_id = $1 AND org_slug = $2 AND status = 'active' LIMIT 1`,
    [userId, orgSlug]
  );
  return (rows.rowCount ?? 0) > 0;
}

export function hashIp(req: express.Request) {
  // A dedicated salt if set; otherwise the unsubscribe-link secret (required in production).
  const salt = String(process.env.IP_HASH_SALT || process.env.NOTIFICATION_SECRET || (process.env.NODE_ENV === "production" ? "" : "thankyou-dev-ip-salt"));
  if (!salt) return null;

  // Never trust a raw X-Forwarded-For here: report thresholds count distinct IPs.
  const ip = clientIp(req);
  if (!ip || ip === "unknown") return null;

  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

export const ShareTypeSchema = z.enum(["PUBLIC_PAGE", "IMPACT_STORY", "ORGANIZATION", "OPPORTUNITY", "SERVICE_REQUEST", "VOLUNTEER_PROFILE", "INVITE"]);

export const ShareVisibilitySchema = z.enum(["public", "link_only", "logged_in_only", "private"]);

export const SHARE_REPORTS_AUTO_REVOKE_THRESHOLD = 3;

export const SHARE_REPORTS_RESTRICT_30D_THRESHOLD = 5;

export async function getShareModerationSummaryForUser(userId: string) {
  const res = await pool.query(
    `
      WITH links AS (
        SELECT id, revoked_at
        FROM share_links
        WHERE created_by_user_id = $1
      ),
      counts AS (
        SELECT
          l.id,
          l.revoked_at,
          COUNT(r.id) FILTER (WHERE r.id IS NOT NULL) AS report_count,
          COUNT(r.id) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days') AS reports_last_30d_for_link,
          MAX(r.created_at) AS last_reported_at
        FROM links l
        LEFT JOIN share_reports r ON r.share_link_id = l.id
        GROUP BY l.id, l.revoked_at
      )
      SELECT
        COUNT(*) FILTER (WHERE report_count > 0) AS reported_links,
        COUNT(*) FILTER (WHERE revoked_at IS NOT NULL AND report_count >= $2) AS auto_revoked_links,
        COALESCE(SUM(reports_last_30d_for_link), 0) AS reports_last_30d,
        MAX(last_reported_at) AS last_reported_at
      FROM counts
    `,
    [userId, SHARE_REPORTS_AUTO_REVOKE_THRESHOLD]
  );

  const row = (res.rows[0] || {});
  const reportedLinks = Number(row.reported_links || 0);
  const autoRevokedLinks = Number(row.auto_revoked_links || 0);
  const reportsLast30d = Number(row.reports_last_30d || 0);
  const lastReportedAt = row.last_reported_at ? new Date(row.last_reported_at).toISOString() : null;

  const shareCreationRestricted = reportsLast30d >= SHARE_REPORTS_RESTRICT_30D_THRESHOLD;

  return {
    reported_links: reportedLinks,
    auto_revoked_links: autoRevokedLinks,
    reports_last_30d: reportsLast30d,
    last_reported_at: lastReportedAt,
    share_creation_restricted: shareCreationRestricted,
    thresholds: {
      auto_revoke_reports: SHARE_REPORTS_AUTO_REVOKE_THRESHOLD,
      restrict_reports_30d: SHARE_REPORTS_RESTRICT_30D_THRESHOLD
    }
  };
}

export const createShareLinkHandler = async (req: express.Request, res: express.Response) => {
  const user = await requireAuthedUser(req, res);
  if (!user) return;

  const parsed = z
    .object({
      share_type: ShareTypeSchema,
      target_ref: z.string().min(1),
      visibility: ShareVisibilitySchema.optional(),
      expires_in_days: z.number().int().positive().max(365).optional()
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const shareType = parsed.data.share_type;
  const targetRef = String(parsed.data.target_ref).trim();
  const visibility = normalizeVisibility(parsed.data.visibility);
  const expiresInDays = parsed.data.expires_in_days;

  // Ownership/permission checks per share type (privacy & safety)
  if (shareType === "ORGANIZATION") {
    const ok = user.is_platform_admin || (await isActiveOrgMember(user.id, targetRef));
    if (!ok) return res.status(403).json({ message: "Forbidden" });
  }

  // OPPORTUNITY is the public name for a service request; both use service_requests (UUID ids).
  if (shareType === "SERVICE_REQUEST" || shareType === "OPPORTUNITY") {
    const idParsed = z.string().uuid().safeParse(targetRef);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid target_ref" });

    const rows = await pool.query(
      `SELECT requester_user_id, requester_org_slug FROM service_requests WHERE id = $1`,
      [targetRef]
    );
    if (rows.rowCount === 0) return res.status(404).json({ message: "Request not found" });

    const row = rows.rows[0];
    const isOwner = String(row.requester_user_id) === String(user.id);
    const orgSlug = row.requester_org_slug as string | null;
    const ok = user.is_platform_admin || isOwner || (orgSlug ? await isActiveOrgMember(user.id, orgSlug) : false);
    if (!ok) return res.status(403).json({ message: "Forbidden" });
  }

  // Validate target exists and compute destination path
  let destinationPath = "/";
  if (shareType === "PUBLIC_PAGE") {
    const rows = await pool.query(`SELECT slug FROM public_pages WHERE slug = $1`, [targetRef]);
    if (rows.rowCount === 0) return res.status(404).json({ message: "Page not found" });
    destinationPath = targetRef === "home" ? "/" : `/${targetRef}`;
  } else if (shareType === "IMPACT_STORY") {
    const rows = await pool.query(`SELECT slug FROM impact_stories WHERE slug = $1`, [targetRef]);
    if (rows.rowCount === 0) return res.status(404).json({ message: "Story not found" });
    destinationPath = `/impact-stories/${encodeURIComponent(targetRef)}`;
  } else if (shareType === "ORGANIZATION") {
    const rows = await pool.query(`SELECT slug FROM organizations WHERE slug = $1`, [targetRef]);
    if (rows.rowCount === 0) return res.status(404).json({ message: "Organization not found" });
    destinationPath = `/organizations/${encodeURIComponent(targetRef)}`;
  } else if (shareType === "OPPORTUNITY") {
    destinationPath = `/opportunities/${encodeURIComponent(targetRef)}`;
  } else if (shareType === "SERVICE_REQUEST") {
    const rows = await pool.query(`SELECT requester_org_slug FROM service_requests WHERE id = $1`, [targetRef]);
    const orgSlug = (rows.rows[0])?.requester_org_slug as string | null;
    destinationPath = orgSlug ? `/org/requests/${encodeURIComponent(targetRef)}` : `/requester/requests/${encodeURIComponent(targetRef)}`;
  }

  const expiresAt =
    typeof expiresInDays === "number" ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

  // Dedupe: reuse an existing active share link for same user/type/target/visibility
  const existing = await pool.query(
    `
      SELECT token, destination_path, visibility, expires_at
      FROM share_links
      WHERE share_type = $1 AND target_ref = $2 AND created_by_user_id = $3
        AND visibility = $4
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [shareType, targetRef, user.id, visibility]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const row = existing.rows[0];
    return res.json({
      token: row.token,
      share_path: `/share/${row.token}`,
      destination_path: row.destination_path,
      visibility: row.visibility,
      expires_at: row.expires_at
    });
  }

  const token = randomToken();

  await pool.query(
    `
      INSERT INTO share_links (token, share_type, target_ref, destination_path, visibility, created_by_user_id, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [token, shareType, targetRef, destinationPath, visibility, user.id, expiresAt]
  );

  return res.json({
    token,
    share_path: `/share/${token}`,
    destination_path: destinationPath,
    visibility,
    expires_at: expiresAt
  });
};

export function buildLoginCtaHref(token: string) {
  return `/login?returnTo=${encodeURIComponent("/s/" + token)}`;
}
