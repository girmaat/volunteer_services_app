/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requireModerator, requirePlatformAdmin } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { parseLimit, parseOffset, shareLinksHaveModerationCols, shareReportsHaveModerationCols } from "./helpers";

export function registerAdminModerationRoutes(app: Express) {

app.get(
    "/v1/admin/enforcement/actions",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const target = String((req.query.target_user_id as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);

      const params: any[] = [];
      let where = "";
      if (target) {
        params.push(target);
        where = `WHERE a.target_user_id = $${params.length}`;
      }
      params.push(limit);

      let rows;

      try {
        rows = await pool.query(
        `SELECT a.id, a.target_user_id, a.action_type, a.ban_until, a.reason, a.notes, a.created_at,
                actor.email AS actor_email,
                target.email AS target_email
           FROM user_enforcement_actions a
           LEFT JOIN users actor ON actor.id = a.created_by_user_id
           JOIN users target ON target.id = a.target_user_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT $${params.length}`,
        params
      );
      } catch (e: any) {
        if (e && (e.code === "42P01" || e.code === "42703")) {
          return res.json({ actions: [] });
        }
        throw e;
      }


      return res.json({ actions: rows.rows });
    })
  );


  app.get(
    "/v1/admin/enforcement/banned",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const limit = parseLimit(req.query.limit, 50, 200);

      let rows;

      try {
        rows = await pool.query(
        `SELECT u.id, u.email, u.banned_until, u.banned_reason, u.strike_count, p.display_name
           FROM users u
           LEFT JOIN user_profiles p ON p.user_id = u.id
          WHERE u.banned_until IS NOT NULL AND u.banned_until > NOW()
          ORDER BY u.banned_until DESC
          LIMIT $1`,
        [limit]
      );
      } catch (e: any) {
        if (e && (e.code === "42P01" || e.code === "42703")) {
          return res.json({ banned_users: [] });
        }
        throw e;
      }


      return res.json({ banned_users: rows.rows });
    })
  );


  // Reports queue
  app.get(
    "/v1/admin/reports",
    wrap(async (req, res) => {
      const r = await requireModerator(pool, req, res);
      if (!r) return;

      const status = String((req.query.status as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      let where = "";
      if (status && ["submitted", "in_review", "resolved", "dismissed"].includes(status)) {
        params.push(status);
        where = `WHERE status = $${params.length}`;
      }
      // Category queues (harassment, scam, safety…): one queue per category.
      const category = String((req.query.category as any) || "").trim().slice(0, 40);
      if (category) {
        params.push(category);
        where = `${where ? where + " AND" : "WHERE"} category = $${params.length}`;
      }
      params.push(limit);
      params.push(offset);

            const shareHas = await shareReportsHaveModerationCols(pool);
      const shareLinksHas = await shareLinksHaveModerationCols(pool);

      const shareStatusSql = shareHas ? "srp.status" : "'submitted'::text";
      const shareAdminNotesSql = shareHas ? "srp.admin_notes" : "NULL::text";
      const shareUpdatedAtSql = shareHas ? "srp.updated_at" : "srp.created_at";
      const shareResolvedAtSql = shareHas ? "srp.resolved_at" : "NULL::timestamptz";

      const shareModerationStateSql = shareLinksHas ? "sl.moderation_state" : "NULL::text";
      const shareRevokedReasonSql = shareLinksHas ? "sl.revoked_reason" : "NULL::text";
      const distinctExpr24h = shareHas
        ? "COUNT(DISTINCT COALESCE(r2.reporter_user_id::text, r2.reporter_ip_hash))"
        : "COUNT(DISTINCT r2.reporter_user_id)";

      const rows = await pool.query(
        `
          WITH all_reports AS (
            SELECT
              'user_report'::text AS source,
              r.id,
              r.category,
              COALESCE(r.details, '') AS details,
              r.status,
              r.admin_notes,
              r.created_at,
              r.updated_at,
              r.resolved_at,
              reporter.email AS reporter_email,
              r.target_user_id,
              target.email AS target_email,
              r.target_request_id,
              sr.title AS target_request_title,
              NULL::text AS share_token,
              NULL::text AS share_destination_path,
              NULL::text AS share_type,
              NULL::timestamptz AS share_revoked_at,
              NULL::text AS share_moderation_state,
              NULL::text AS share_revoked_reason,
              NULL::int AS share_report_count,
              NULL::int AS share_distinct_24h
            FROM user_reports r
            JOIN users reporter ON reporter.id = r.reporter_user_id
            LEFT JOIN users target ON target.id = r.target_user_id
            LEFT JOIN service_requests sr ON sr.id = r.target_request_id

            UNION ALL

            SELECT
              'share_report'::text AS source,
              srp.id,
              srp.reason AS category,
              COALESCE(srp.details, '') AS details,
              ${shareStatusSql} AS status,
              ${shareAdminNotesSql} AS admin_notes,
              srp.created_at,
              ${shareUpdatedAtSql} AS updated_at,
              ${shareResolvedAtSql} AS resolved_at,
              COALESCE(reporter.email, '(anonymous)') AS reporter_email,
              sl.created_by_user_id AS target_user_id,
              owner.email AS target_email,
              CASE WHEN sl.share_type = 'SERVICE_REQUEST' THEN sl.target_ref::uuid ELSE NULL END AS target_request_id,
              CASE
                WHEN sl.share_type = 'SERVICE_REQUEST' THEN req.title
                WHEN sl.share_type = 'OPPORTUNITY' THEN CONCAT('Opportunity: ', req.title)
                ELSE CONCAT('Share link: ', sl.share_type)
              END AS target_request_title,
              sl.token AS share_token,
              sl.destination_path AS share_destination_path,
              sl.share_type,
              sl.revoked_at AS share_revoked_at,
              ${shareModerationStateSql} AS share_moderation_state,
              ${shareRevokedReasonSql} AS share_revoked_reason,
              (SELECT COUNT(*)::int FROM share_reports r2 WHERE r2.share_link_id = sl.id) AS share_report_count,
              (
                SELECT (${distinctExpr24h})::int
                  FROM share_reports r2
                 WHERE r2.share_link_id = sl.id
                   AND r2.created_at >= NOW() - INTERVAL '24 hours'
              ) AS share_distinct_24h
            FROM share_reports srp
            JOIN share_links sl ON sl.id = srp.share_link_id
            LEFT JOIN users reporter ON reporter.id = srp.reporter_user_id
            LEFT JOIN users owner ON owner.id = sl.created_by_user_id
            LEFT JOIN service_requests req ON req.id = CASE WHEN sl.share_type IN ('SERVICE_REQUEST','OPPORTUNITY') AND sl.target_ref ~* '^[0-9a-f-]{36}$' THEN sl.target_ref::uuid ELSE NULL END
          )
          SELECT
            source,
            id,
            category,
            details,
            status,
            admin_notes,
            created_at,
            updated_at,
            resolved_at,
            reporter_email,
            target_user_id,
            target_email,
            target_request_id,
            target_request_title,
            share_token,
            share_destination_path,
            share_type,
            share_revoked_at,
            share_moderation_state,
            share_revoked_reason,
            share_report_count,
            share_distinct_24h
          FROM all_reports
          ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
        `,
        params
      );

return res.json({ reports: rows.rows, limit, offset });
    })
  );




  // Report details (used by Admin dashboard "Details" buttons)
  app.get(
    "/v1/admin/reports/:id",
    wrap(async (req, res) => {
      const r = await requireModerator(pool, req, res);
      if (!r) return;

      const reportId = String(req.params.id || "").trim();
      if (!reportId) return res.status(400).json({ message: "Invalid report id" });

      const shareHas = await shareReportsHaveModerationCols(pool);
      const shareLinksHas = await shareLinksHaveModerationCols(pool);

      const shareStatusSql = shareHas ? "srp.status" : "'submitted'::text";
      const shareAdminNotesSql = shareHas ? "srp.admin_notes" : "NULL::text";
      const shareUpdatedAtSql = shareHas ? "srp.updated_at" : "srp.created_at";
      const shareResolvedAtSql = shareHas ? "srp.resolved_at" : "NULL::timestamptz";

      const shareModerationStateSql = shareLinksHas ? "sl.moderation_state" : "NULL::text";
      const shareRevokedReasonSql = shareLinksHas ? "sl.revoked_reason" : "NULL::text";
      const distinctExpr24h = shareHas
        ? "COUNT(DISTINCT COALESCE(r2.reporter_user_id::text, r2.reporter_ip_hash))"
        : "COUNT(DISTINCT r2.reporter_user_id)";

      const rows = await pool.query(
        `
          WITH all_reports AS (
            SELECT
              'user_report'::text AS source,
              r.id,
              r.category,
              COALESCE(r.details, '') AS details,
              r.status,
              r.admin_notes,
              r.created_at,
              r.updated_at,
              r.resolved_at,
              reporter.email AS reporter_email,
              r.target_user_id,
              target.email AS target_email,
              r.target_request_id,
              sr.title AS target_request_title,
              NULL::text AS share_token,
              NULL::text AS share_destination_path,
              NULL::text AS share_type,
              NULL::timestamptz AS share_revoked_at,
              NULL::text AS share_moderation_state,
              NULL::text AS share_revoked_reason,
              NULL::int AS share_report_count,
              NULL::int AS share_distinct_24h
            FROM user_reports r
            JOIN users reporter ON reporter.id = r.reporter_user_id
            LEFT JOIN users target ON target.id = r.target_user_id
            LEFT JOIN service_requests sr ON sr.id = r.target_request_id

            UNION ALL

            SELECT
              'share_report'::text AS source,
              srp.id,
              srp.reason AS category,
              COALESCE(srp.details, '') AS details,
              ${shareStatusSql} AS status,
              ${shareAdminNotesSql} AS admin_notes,
              srp.created_at,
              ${shareUpdatedAtSql} AS updated_at,
              ${shareResolvedAtSql} AS resolved_at,
              COALESCE(reporter.email, '(anonymous)') AS reporter_email,
              sl.created_by_user_id AS target_user_id,
              owner.email AS target_email,
              CASE WHEN sl.share_type = 'SERVICE_REQUEST' THEN sl.target_ref::uuid ELSE NULL END AS target_request_id,
              CASE
                WHEN sl.share_type = 'SERVICE_REQUEST' THEN req.title
                WHEN sl.share_type = 'OPPORTUNITY' THEN CONCAT('Opportunity: ', req.title)
                ELSE CONCAT('Share link: ', sl.share_type)
              END AS target_request_title,
              sl.token AS share_token,
              sl.destination_path AS share_destination_path,
              sl.share_type,
              sl.revoked_at AS share_revoked_at,
              ${shareModerationStateSql} AS share_moderation_state,
              ${shareRevokedReasonSql} AS share_revoked_reason,
              (SELECT COUNT(*)::int FROM share_reports r2 WHERE r2.share_link_id = sl.id) AS share_report_count,
              (
                SELECT (${distinctExpr24h})::int
                  FROM share_reports r2
                 WHERE r2.share_link_id = sl.id
                   AND r2.created_at >= NOW() - INTERVAL '24 hours'
              ) AS share_distinct_24h
            FROM share_reports srp
            JOIN share_links sl ON sl.id = srp.share_link_id
            LEFT JOIN users reporter ON reporter.id = srp.reporter_user_id
            LEFT JOIN users owner ON owner.id = sl.created_by_user_id
            LEFT JOIN service_requests req ON req.id = CASE WHEN sl.share_type IN ('SERVICE_REQUEST','OPPORTUNITY') AND sl.target_ref ~* '^[0-9a-f-]{36}$' THEN sl.target_ref::uuid ELSE NULL END
          )
          SELECT
            source,
            id,
            category,
            details,
            status,
            admin_notes,
            created_at,
            updated_at,
            resolved_at,
            reporter_email,
            target_user_id,
            target_email,
            target_request_id,
            target_request_title,
            share_token,
            share_destination_path,
            share_type,
            share_revoked_at,
            share_moderation_state,
            share_revoked_reason,
            share_report_count,
            share_distinct_24h
          FROM all_reports
          WHERE id = $1
          LIMIT 1
        `,
        [reportId]
      );

      if ((rows.rowCount ?? 0) == 0) return res.status(404).json({ message: "Report not found" });
      return res.json({
        report: rows.rows[0],
        capabilities: {
          share_reports_moderation_cols: shareHas,
          share_links_moderation_cols: shareLinksHas
        }
      });
    })
  );

  app.post(
    "/v1/admin/reports/:id/update",
    wrap(async (req, res) => {
      const r = await requireModerator(pool, req, res);
      if (!r) return;

      const reportId = String(req.params.id || "");
      const schema = z
        .object({
          status: z.enum(["submitted", "in_review", "resolved", "dismissed"]).optional(),
          admin_notes: z.string().max(4000).optional().nullable()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const status = parsed.data.status;
      const adminNotes = parsed.data.admin_notes !== undefined ? parsed.data.admin_notes : undefined;

      const sets: string[] = [];
      const params: any[] = [reportId];
      if (status) {
        params.push(status);
        sets.push(`status = $${params.length}`);
        if (status === "resolved") sets.push(`resolved_at = NOW()`);
        if (status !== "resolved") sets.push(`resolved_at = NULL`);
      }
      if (adminNotes !== undefined) {
        params.push(adminNotes);
        sets.push(`admin_notes = $${params.length}`);
      }
      if (sets.length === 0) return res.status(400).json({ message: "No changes" });
      sets.push(`updated_at = NOW()`);

      const upd = await pool.query(`UPDATE user_reports SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
      if ((upd.rowCount ?? 0) === 0) {
        const shareHas = await shareReportsHaveModerationCols(pool);
        if (!shareHas) {
          return res.status(400).json({ message: "Share-link reports are visible, but can’t be updated because DB migrations are disabled (share_reports lacks moderation columns). Enable RUN_MIGRATIONS or run the migrations as the DB owner." });
        }
        const upd2 = await pool.query(`UPDATE share_reports SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
        if ((upd2.rowCount ?? 0) === 0) return res.status(404).json({ message: "Report not found" });
      }
      return res.json({ ok: true });
    })
  );


  
  // Share-link report workflow actions (warn / block / unblock / clear)
  app.post(
    "/v1/admin/share-reports/:id/action",
    wrap(async (req, res) => {
      const r = await requireModerator(pool, req, res);
      if (!r) return;

      const reportId = String(req.params.id || "");
      const schema = z
        .object({
          action: z.enum(["warn", "block", "unblock", "clear"]),
          admin_notes: z.string().max(4000).optional().nullable()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const shareHas = await shareReportsHaveModerationCols(pool);
      const linksHas = await shareLinksHaveModerationCols(pool);

      const reportRes = await pool.query(
        `
          SELECT srp.id, srp.share_link_id, sl.token
            FROM share_reports srp
            JOIN share_links sl ON sl.id = srp.share_link_id
           WHERE srp.id = $1
           LIMIT 1
        `,
        [reportId]
      );
      if (reportRes.rowCount === 0) return res.status(404).json({ message: "Report not found" });

      const linkId = (reportRes.rows[0] as any).share_link_id;
      const token = String((reportRes.rows[0] as any).token || "");

      const action = parsed.data.action;
      const adminNotes = parsed.data.admin_notes !== undefined ? parsed.data.admin_notes : undefined;

      if ((action === "warn" || action === "clear") && !linksHas) {
        return res.status(400).json({
          message:
            "Share-link warning state requires newer sharing schema. Run backend/scripts/db/apply_sharing_schema.* as the DB owner, or enable RUN_MIGRATIONS."
        });
      }

      if (action === "block") {
        if (linksHas) {
          await pool.query(
            `
              UPDATE share_links
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revoked_reason = 'admin_block',
                     revoked_by_user_id = $2,
                     moderation_state = 'blocked',
                     moderation_updated_at = NOW(),
                     moderation_updated_by_user_id = $2,
                     moderation_notes = COALESCE($3, moderation_notes)
               WHERE id = $1
            `,
            [linkId, (r.user as any).id, adminNotes ?? null]
          );
        } else {
          await pool.query(`UPDATE share_links SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1`, [linkId]);
        }
      }

      if (action === "unblock") {
        if (linksHas) {
          // If there are still reports, keep the warning state; otherwise clear.
          const rc = await pool.query(`SELECT COUNT(*)::int AS n FROM share_reports WHERE share_link_id = $1`, [linkId]);
          const n = Number((rc.rows[0] as any)?.n || 0);
          const nextState = n > 0 ? "reported" : "clean";

          await pool.query(
            `
              UPDATE share_links
                 SET revoked_at = NULL,
                     revoked_reason = NULL,
                     revoked_by_user_id = NULL,
                     moderation_state = $3,
                     moderation_updated_at = NOW(),
                     moderation_updated_by_user_id = $2,
                     moderation_notes = COALESCE($4, moderation_notes)
               WHERE id = $1
            `,
            [linkId, (r.user as any).id, nextState, adminNotes ?? null]
          );
        } else {
          await pool.query(`UPDATE share_links SET revoked_at = NULL WHERE id = $1`, [linkId]);
        }
      }

      if (action === "warn") {
        await pool.query(
          `
            UPDATE share_links
               SET moderation_state = 'reported',
                   moderation_updated_at = NOW(),
                   moderation_updated_by_user_id = $2,
                   moderation_notes = COALESCE($3, moderation_notes)
             WHERE id = $1
          `,
          [linkId, (r.user as any).id, adminNotes ?? null]
        );
      }

      if (action === "clear") {
        await pool.query(
          `
            UPDATE share_links
               SET moderation_state = 'clean',
                   moderation_updated_at = NOW(),
                   moderation_updated_by_user_id = $2,
                   moderation_notes = COALESCE($3, moderation_notes)
             WHERE id = $1
          `,
          [linkId, (r.user as any).id, adminNotes ?? null]
        );
      }

      if (shareHas) {
        const sets: string[] = ["status = 'resolved'", "updated_at = NOW()", "resolved_at = NOW()", "action = $2", "action_at = NOW()", "action_by_user_id = $3"];
        const params: any[] = [reportId, action === "clear" ? "clear" : action, (r.user as any).id];

        if (adminNotes !== undefined) {
          params.push(adminNotes ?? null);
          sets.push(`admin_notes = $${params.length}`);
        }

        await pool.query(`UPDATE share_reports SET ${sets.join(", ")} WHERE id = $1`, params);
      }

      return res.json({ ok: true, token });
    })
  );


// Incident review (org_incident_reports)
  app.get(
    "/v1/admin/incidents",
    wrap(async (req, res) => {
      const r = await requireModerator(pool, req, res);
      if (!r) return;

      const status = String((req.query.status as any) || "").trim();
      const severity = String((req.query.severity as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      const clauses: string[] = [];
      if (status && ["open", "in_review", "resolved", "closed"].includes(status)) {
        params.push(status);
        clauses.push(`i.status = $${params.length}`);
      }
      if (severity && ["low", "medium", "high", "critical"].includes(severity)) {
        params.push(severity);
        clauses.push(`i.severity = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      params.push(limit);
      params.push(offset);

      const rows = await pool.query(
        `SELECT
           i.id,
           i.org_slug,
           o.name AS org_name,
           i.title,
           i.description,
           i.severity,
           i.status,
           i.internal_notes,
           i.outcome,
           i.created_at,
           i.updated_at,
           sr.id AS request_id,
           sr.title AS request_title,
           u.email AS volunteer_email
         FROM org_incident_reports i
         LEFT JOIN organizations o ON o.slug = i.org_slug
         LEFT JOIN service_requests sr ON sr.id = i.request_id
         LEFT JOIN users u ON u.id = i.volunteer_user_id
         ${where}
         ORDER BY i.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({ incidents: rows.rows, limit, offset });
    })
  );


  app.post(
    "/v1/admin/incidents/:id/update",
    wrap(async (req, res) => {
      const r = await requireModerator(pool, req, res);
      if (!r) return;

      const incidentId = String(req.params.id || "");
      const schema = z
        .object({
          status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
          internal_notes: z.string().max(8000).optional().nullable(),
          outcome: z.string().max(4000).optional().nullable()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const sets: string[] = [];
      const params: any[] = [incidentId];
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${k} = $${params.length}`);
      }
      if (sets.length === 0) return res.status(400).json({ message: "No changes" });
      sets.push(`updated_at = NOW()`);

      const upd = await pool.query(`UPDATE org_incident_reports SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Incident not found" });
      return res.json({ ok: true });
    })
  );
}
