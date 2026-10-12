import type { Express } from "express";
import { requirePlatformAdmin } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { nowIso } from "./helpers";

export function registerAdminDashboardRoutes(app: Express) {
  // Dashboard
  app.get(
    "/v1/admin/dashboard",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const counts = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM users) AS users_total,
           (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days') AS users_new_7d,
           (SELECT COUNT(*)::int FROM organizations) AS orgs_total,
           (SELECT COUNT(*)::int FROM service_requests) AS requests_total,
           (SELECT COUNT(*)::int FROM service_requests WHERE status IN ('open','pending')) AS requests_open,
           (SELECT COUNT(*)::int FROM user_reports WHERE status IN ('submitted','in_review')) AS reports_open,
           (SELECT COUNT(*)::int FROM user_reports WHERE status = 'submitted') AS reports_submitted,
           (SELECT COUNT(*)::int FROM org_incident_reports WHERE status IN ('open','in_review')) AS incidents_open,
           (SELECT COUNT(*)::int FROM organizations WHERE verification_required = TRUE OR verification_status IN ('required','submitted','rejected')) AS org_verification_queue,
           (SELECT COUNT(*)::int FROM users WHERE verification_required = TRUE OR verification_status IN ('required','submitted','rejected')) AS user_verification_queue,
           (SELECT COUNT(*)::int FROM users WHERE banned_until IS NOT NULL AND banned_until > NOW()) AS banned_users
        `
      );

      const shareCounts = await pool.query(
        `SELECT
               (SELECT COUNT(*)::int FROM share_reports WHERE status IN ('submitted','in_review')) AS reports_open,
               (SELECT COUNT(*)::int FROM share_reports WHERE status = 'submitted') AS reports_submitted`
      );

      const countsRow = counts.rows[0] || {};
      countsRow.reports_open = (countsRow.reports_open || 0) + ((shareCounts.rows[0])?.reports_open || 0);
      countsRow.reports_submitted = (countsRow.reports_submitted || 0) + ((shareCounts.rows[0])?.reports_submitted || 0);

const recent = await pool.query(
        `SELECT id, email, created_at
           FROM users
          ORDER BY created_at DESC
          LIMIT 8`
      );

      const recentReports = await pool.query(
        `
          WITH all_reports AS (
            SELECT
              'user_report'::text AS source,
              r.id,
              r.category,
              r.status,
              r.created_at,
              reporter.email AS reporter_email,
              target.email AS target_email
            FROM user_reports r
            JOIN users reporter ON reporter.id = r.reporter_user_id
            LEFT JOIN users target ON target.id = r.target_user_id

            UNION ALL

            SELECT
              'share_report'::text AS source,
              sr.id,
              sr.reason AS category,
              'submitted'::text AS status,
              sr.created_at,
              COALESCE(reporter.email, '(anonymous)') AS reporter_email,
              owner.email AS target_email
            FROM share_reports sr
            JOIN share_links sl ON sl.id = sr.share_link_id
            LEFT JOIN users reporter ON reporter.id = sr.reporter_user_id
            LEFT JOIN users owner ON owner.id = sl.created_by_user_id
          )
          SELECT source, id, category, status, created_at, reporter_email, target_email
          FROM all_reports
          ORDER BY created_at DESC
          LIMIT 8
        `
      );

      return res.json({
        generated_at: nowIso(),
        counts: countsRow,
        recent_users: recent.rows,
        recent_reports: recentReports.rows
      });
    })
  );
}
