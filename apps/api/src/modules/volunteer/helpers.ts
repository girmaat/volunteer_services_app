import { visibleToViewerAgeSql } from "../../lib/age";
import { pool } from "../../lib/db";
import { discoverableSql } from "../requests/lifecycle";

// Volunteer area: opportunity discovery lists + detail (Step 3.2 / 3.3)

export type VolunteerOpportunityRow = {
  id: string;
  title: string;
  summary: string;
  location: string;
  mode: "in-person" | "remote" | "hybrid";
  updated_at: string;
  organization_slug: string | null;
  organization_name: string | null;
  tags: string[];
  saved: boolean;
  application_id: string | null;
  application_status: string | null;
};

/** Live requests a volunteer may see (sensitive ones only once Phase 4.4 discovery checks trust tier). */
const LIVE = `${discoverableSql("o")} AND NOT o.is_sensitive AND ${visibleToViewerAgeSql("o", "$1")}`;

export async function volunteerOpportunityRowsForUser(
  userId: string,
  whereSql: string,
  whereParams: any[] = [],
  orderSql = "o.updated_at DESC"
): Promise<VolunteerOpportunityRow[]> {
  const w = whereSql.trim();
  const effectiveWhereSql =
    w === ""
      ? `WHERE ${LIVE}`
      : /^WHERE\b/i.test(w)
        ? w.replace(/^WHERE\b/i, `WHERE ${LIVE} AND`)
        : `WHERE ${LIVE} AND (${w})`;

  const rows = await pool.query(
    `
    SELECT
      o.id,
      o.title,
      LEFT(o.description, 240) AS summary,
      COALESCE(o.location_text, '') AS location,
      COALESCE(o.mode, 'remote') AS mode,
      o.public_area,
      o.starts_at, o.needed_by, o.schedule_type, o.recurrence_rule, o.timezone, o.apply_by,
      o.updated_at,
      o.requester_org_slug AS organization_slug,
      org.name AS organization_name,
      (org.verification_status = 'approved') AS organization_verified,
      o.tags,
      (s.user_id IS NOT NULL) AS saved,
      a.id AS application_id,
      a.status AS application_status
    FROM service_requests o
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
      LEFT JOIN LATERAL (
        SELECT id, status, message, created_at
        FROM request_applications
        WHERE volunteer_user_id = $1 AND request_id = o.id
        ORDER BY updated_at DESC
        LIMIT 1
      ) a ON TRUE
    ${effectiveWhereSql}
    ORDER BY ${orderSql}
    `,
    [userId, ...whereParams]
  );
  return rows.rows as VolunteerOpportunityRow[];
}

export async function listVolunteerSavedOpportunities(userId: string) {
  const rows = await pool.query(
    `
    SELECT
      o.id,
      o.title,
      LEFT(o.description, 240) AS summary,
      COALESCE(o.location_text, '') AS location,
      COALESCE(o.mode, 'remote') AS mode,
      o.updated_at,
      o.requester_org_slug AS organization_slug,
      org.name AS organization_name,
      o.requester_user_id AS requester_user_id,
      o.tags,
      TRUE AS saved,
      a.id AS application_id,
      a.status AS application_status,
      s.created_at AS saved_at
    FROM volunteer_saved_requests s
    JOIN service_requests o ON o.id = s.request_id
    LEFT JOIN organizations org ON org.slug = o.requester_org_slug
    LEFT JOIN LATERAL (
      SELECT id, status
      FROM request_applications
      WHERE volunteer_user_id = $1 AND request_id = o.id
      ORDER BY updated_at DESC
      LIMIT 1
    ) a ON TRUE
    WHERE s.user_id = $1
    ORDER BY s.created_at DESC
    `,
    [userId]
  );

  return rows.rows;
}

export function illustrateRows(rows: any[]) {
  // Strip any driver-specific metadata + ensure stable keys
  return rows.map((r) => ({
    id: r.id,
    rating: Number(r.rating || 0),
    strengths: r.strengths ?? null,
    improvements: r.improvements ?? null,
    would_work_again: typeof r.would_work_again === "boolean" ? r.would_work_again : null,
    created_at: r.created_at,
    request_id: r.request_id ?? null,
    request_application_id: r.request_application_id ?? null,
    request_title: r.request_title ?? null,
    organization_name: r.organization_name ?? null,
    reviewer_name: r.reviewer_name ?? "Unknown"
  }));
}
