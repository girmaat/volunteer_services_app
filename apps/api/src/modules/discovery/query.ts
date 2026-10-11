/**
 * Discovery and matching (Phase 4.4) with location privacy (4.5).
 *
 * One SQL query serves the public list, the volunteer feeds (Recommended · Near you · Remote) and
 * search. Visibility: live + approved + not taken down + owner not shadow-banned; sensitive
 * categories only for viewers at the category's apply tier; never the viewer's own requests or
 * people they've blocked. Only `public_area` leaves this module — exact addresses and coordinates
 * are never returned (distance is).
 */
import { pool } from "../../lib/db";
import type { PolicyUser } from "../../lib/policy";
import { discoverableSql } from "../requests/lifecycle";

export type Tab = "recommended" | "nearby" | "remote" | "all";

export type DiscoveryFilters = {
  q?: string;
  categories?: string[];
  skills?: string[];
  mode?: "in-person" | "remote" | "hybrid";
  radius?: number;
  startsAfter?: string;
  startsBefore?: string;
  verifiedOrg?: boolean;
  urgency?: "low" | "normal" | "high";
  tab?: Tab;
  orgSlug?: string;
  limit: number;
  offset: number;
};

/** Volunteer profile facts used for matching. */
export type Viewer = {
  id: string | null;
  trusted: boolean;
  skills: string[];
  categories: string[];
  days: string[];
  timezone: string | null;
  remoteOk: boolean;
  inPersonOk: boolean;
  lat: number | null;
  lng: number | null;
  radius: number;
  hasCar: boolean;
};

// Volunteers pick broad "help categories" at onboarding; map them onto request categories.
const HELP_TO_CATEGORY: Record<string, string[]> = {
  food: ["food"],
  seniors: ["companionship", "errands"],
  transport: ["transport"],
  education: ["tutoring"],
  tutoring: ["tutoring"],
  tech: ["tech", "skilled"],
  translation: ["translation"],
  community: ["events"],
  events: ["events"],
  errands: ["errands"],
  companionship: ["companionship"]
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_NAME: Record<string, string> = { sun: "SU", mon: "MO", tue: "TU", wed: "WE", thu: "TH", fri: "FR", sat: "SA" };

export async function loadViewer(user: PolicyUser | null): Promise<Viewer> {
  const blank: Viewer = { id: user?.id ?? null, trusted: user?.trust_tier === "trusted", skills: [], categories: [], days: [], timezone: null, remoteOk: true, inPersonOk: true, lat: null, lng: null, radius: 25, hasCar: false };
  if (!user) return blank;
  const r = await pool.query(
    `SELECT p.experience_tags, p.help_categories, p.geo_lat, p.geo_lng, p.service_radius_miles, p.has_car,
            a.days, a.timezone, a.remote_ok, a.in_person_ok
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN user_availability a ON a.user_id = u.id
      WHERE u.id = $1`,
    [user.id]
  );
  const row = r.rows[0] || {};
  const help: string[] = (row.help_categories || []).map((s: string) => String(s).toLowerCase());
  return {
    ...blank,
    skills: Array.from(new Set([...(row.experience_tags || []), ...help].map((s: string) => String(s).toLowerCase()))),
    categories: Array.from(new Set(help.flatMap((h) => HELP_TO_CATEGORY[h] ?? []))),
    days: (row.days || []).map((d: string) => DAY_NAME[String(d).slice(0, 3).toLowerCase()] ?? String(d).toUpperCase()).filter((d: string) => DAY_CODES.includes(d)),
    timezone: row.timezone || null,
    remoteOk: row.remote_ok ?? true,
    inPersonOk: row.in_person_ok ?? true,
    lat: row.geo_lat ?? null,
    lng: row.geo_lng ?? null,
    radius: Number(row.service_radius_miles) || 25,
    hasCar: Boolean(row.has_car)
  };
}

/** Public, privacy-safe columns plus match components. $1..$11 are viewer params (see `viewerParams`). */
const SELECT = `
  r.id, r.title, LEFT(r.description, 280) AS summary, r.description, r.category, c.label AS category_label, r.mode,
  r.public_area, r.starts_at, r.ends_at, r.schedule_type, r.recurrence_rule, r.timezone, r.duration_minutes, r.apply_by,
  r.volunteers_needed, r.urgency, r.required_skills, r.nice_to_have_skills, r.min_age, r.requires_background_check,
  r.requires_training, r.requires_waiver, r.requires_car, r.accessibility_notes, r.equipment_notes, r.is_sensitive,
  r.status, r.published_at, r.updated_at,
  org.name AS organization_name, org.slug AS organization_slug,
  COALESCE(org.verification_status IN ('approved', 'verified'), FALSE) AS organization_verified,
  COALESCE(NULLIF(rp.display_name, ''), 'A neighbor') AS requester_display_name,
  (SELECT COUNT(*)::int FROM request_applications x WHERE x.request_id = r.id AND x.status IN ('accepted','confirmed','completed')) AS accepted_count,
  cardinality(ARRAY(SELECT unnest(r.required_skills) INTERSECT SELECT unnest($2::text[])))::int AS must_matched,
  cardinality(r.required_skills)::int AS must_total,
  cardinality(ARRAY(SELECT unnest(r.nice_to_have_skills) INTERSECT SELECT unnest($2::text[])))::int AS nice_matched,
  (r.category = ANY($3::text[])) AS category_match,
  CASE
    WHEN r.schedule_type = 'recurring' THEN EXISTS (SELECT 1 FROM unnest(string_to_array(substring(r.recurrence_rule FROM 'BYDAY=([A-Z,]+)'), ',')) d WHERE d = ANY($4::text[]))
    WHEN r.starts_at IS NOT NULL THEN (ARRAY['SU','MO','TU','WE','TH','FR','SA'])[EXTRACT(DOW FROM r.starts_at AT TIME ZONE COALESCE(r.timezone, 'UTC'))::int + 1] = ANY($4::text[])
    ELSE TRUE END AS day_match,
  CASE WHEN $5::text IS NULL OR r.timezone IS NULL THEN NULL
       ELSE ABS(EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE r.timezone) - (NOW() AT TIME ZONE $5::text))) / 3600) END AS tz_gap_hours,
  CASE WHEN r.mode = 'remote' THEN NULL ELSE geo_miles($6::float8, $7::float8, r.location_lat, r.location_lng) END AS distance_miles,
  $8::float8 AS viewer_radius,
  $9::boolean AS viewer_has_car`;

function viewerParams(v: Viewer) {
  // $1 viewer id, $2 skills, $3 categories, $4 days, $5 timezone, $6 lat, $7 lng, $8 radius, $9 has car, $10 trusted
  return [v.id, v.skills, v.categories, v.days, v.timezone, v.lat, v.lng, v.radius, v.hasCar, v.trusted];
}

/** Visibility for the viewer (in addition to discoverableSql). */
const VISIBLE = `
  ${discoverableSql("r")}
  AND (NOT r.is_sensitive OR ($10::boolean AND c.min_apply_tier IN ('basic', 'trusted')))
  AND ($1::uuid IS NULL OR r.requester_user_id <> $1::uuid)
  AND ($1::uuid IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_blocks b
         WHERE (b.blocker_user_id = $1::uuid AND b.blocked_user_id = r.requester_user_id)
            OR (b.blocked_user_id = $1::uuid AND b.blocker_user_id = r.requester_user_id)))`;

const FROM = `
  FROM service_requests r
  JOIN request_categories c ON c.slug = r.category
  LEFT JOIN organizations org ON org.slug = r.requester_org_slug
  LEFT JOIN user_profiles rp ON rp.user_id = r.requester_user_id`;

/** Weighted score: must-have skills ×3, nice-to-have ×1, category 2, day 1, remote tz 1, nearby up to 3, car mismatch −5. */
const SCORE = `(
  must_matched * 3 + nice_matched + CASE WHEN category_match THEN 2 ELSE 0 END + CASE WHEN day_match THEN 1 ELSE 0 END
  + CASE WHEN mode = 'remote' AND tz_gap_hours IS NOT NULL AND tz_gap_hours <= 3 THEN 1 ELSE 0 END
  + CASE WHEN distance_miles IS NOT NULL AND distance_miles <= viewer_radius THEN 1 + 2 * (1 - distance_miles / NULLIF(viewer_radius, 0)) ELSE 0 END
  + CASE WHEN requires_car AND NOT viewer_has_car THEN -5 ELSE 0 END
  + CASE WHEN urgency = 'high' THEN 0.5 ELSE 0 END
  + CASE WHEN organization_verified THEN 0.5 ELSE 0 END
)`;

export async function discover(viewer: Viewer, f: DiscoveryFilters) {
  const params: unknown[] = viewerParams(viewer);
  const where: string[] = [VISIBLE];
  const add = (sql: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sql(params.length));
  };
  let rankExpr = "0";
  if (f.q) {
    params.push(f.q);
    const n = params.length;
    where.push(`r.search_tsv @@ websearch_to_tsquery('english', $${n})`);
    rankExpr = `ts_rank(r.search_tsv, websearch_to_tsquery('english', $${n}))`;
  }
  if (f.categories?.length) add((n) => `r.category = ANY($${n}::text[])`, f.categories);
  if (f.skills?.length) add((n) => `(r.required_skills && $${n}::text[] OR r.nice_to_have_skills && $${n}::text[])`, f.skills);
  if (f.mode) add((n) => `r.mode = $${n}`, f.mode);
  // Recurring requests keep running after their first session, so only the "before" bound applies to them.
  if (f.startsAfter) add((n) => `(r.starts_at IS NULL OR r.schedule_type = 'recurring' OR r.starts_at >= $${n}::timestamptz)`, f.startsAfter);
  if (f.startsBefore) add((n) => `(r.starts_at IS NULL OR r.starts_at <= $${n}::timestamptz)`, f.startsBefore);
  if (f.urgency) add((n) => `r.urgency = $${n}`, f.urgency);
  if (f.orgSlug) add((n) => `r.requester_org_slug = $${n}`, f.orgSlug);
  if (f.verifiedOrg) where.push(`org.verification_status IN ('approved', 'verified')`);

  const tab = f.tab ?? "all";
  if (tab === "remote") where.push(`r.mode IN ('remote', 'hybrid')`);
  const outer: string[] = [];
  const radius = f.radius ?? viewer.radius;
  if (tab === "nearby" || f.radius) {
    if (viewer.lat == null || viewer.lng == null) {
      // Without a location we can't compute distance; Near you is empty rather than wrong.
      if (tab === "nearby") return { items: [], nextOffset: null, needsLocation: true };
    } else {
      params.push(radius);
      const n = params.length;
      // Bounding box first (uses the lat/lng index), then exact distance.
      where.push(
        `r.mode <> 'remote' AND r.location_lat BETWEEN $6::float8 - ($${n}::float8 / 69.0) AND $6::float8 + ($${n}::float8 / 69.0)
         AND r.location_lng BETWEEN $7::float8 - ($${n}::float8 / (69.0 * GREATEST(cos(radians($6::float8)), 0.01))) AND $7::float8 + ($${n}::float8 / (69.0 * GREATEST(cos(radians($6::float8)), 0.01)))`
      );
      outer.push(`distance_miles <= $${n}::float8`);
    }
  }
  if (tab === "recommended") {
    // Respect the volunteer's own remote / in-person preferences.
    where.push(`((r.mode IN ('remote','hybrid') AND ${viewer.remoteOk ? "TRUE" : "FALSE"}) OR (r.mode IN ('in-person','hybrid') AND ${viewer.inPersonOk ? "TRUE" : "FALSE"}))`);
  }

  const order =
    tab === "nearby"
      ? "distance_miles ASC NULLS LAST, published_at DESC"
      : tab === "recommended"
        ? "score DESC, published_at DESC"
        : f.q
          ? "rank DESC, score DESC, published_at DESC"
          : "published_at DESC NULLS LAST, id";

  params.push(f.limit + 1, f.offset);
  const sql = `
    WITH base AS (SELECT ${SELECT}, ${rankExpr} AS rank ${FROM} WHERE ${where.join(" AND ")})
    SELECT *, ${SCORE} AS score FROM base
    ${outer.length ? "WHERE " + outer.join(" AND ") : ""}
    ORDER BY ${order}
    LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const r = await pool.query(sql, params);
  const rows = r.rows.slice(0, f.limit).map((row) => present(row, viewer));
  return { items: rows, nextOffset: r.rows.length > f.limit ? f.offset + f.limit : null, needsLocation: false };
}

/** Detail for one request (same visibility rules). `exact_address` only for accepted volunteers. */
export async function discoverOne(viewer: Viewer, id: string, opts: { applicant?: boolean } = {}) {
  // Someone who already applied keeps access while the request is filled, paused, completed or canceled.
  const visible = opts.applicant ? "r.removed_at IS NULL AND r.status <> 'draft' AND ($10::boolean OR TRUE) AND ($1::uuid IS NULL OR TRUE)" : VISIBLE;
  const r = await pool.query(
    `WITH base AS (SELECT ${SELECT}, 0 AS rank, r.exact_address, r.requester_user_id ${FROM} WHERE r.id = $11::uuid AND ${visible})
     SELECT *, ${SCORE} AS score FROM base`,
    [...viewerParams(viewer), id]
  );
  return r.rows[0] ? r.rows[0] : null;
}

const fmtMiles = (d: number) => (d < 1 ? "under 1 mi" : `${Math.round(d)} mi`);
const DAY_FULL: Record<string, string> = { SU: "Sundays", MO: "Mondays", TU: "Tuesdays", WE: "Wednesdays", TH: "Thursdays", FR: "Fridays", SA: "Saturdays" };

/** Shapes a row for clients: drops internals, adds "why it matches". */
export function present(row: Record<string, any>, viewer: Viewer) {
  const reasons: string[] = [];
  if (viewer.id) {
    if (row.must_total > 0 && row.must_matched > 0) reasons.push(`${row.must_matched} of ${row.must_total} skills`);
    else if (row.nice_matched > 0) reasons.push("a nice-to-have skill you listed");
    if (row.distance_miles != null && row.distance_miles <= (row.viewer_radius ?? 25)) reasons.push(fmtMiles(Number(row.distance_miles)));
    if (row.mode === "remote" && row.tz_gap_hours != null && row.tz_gap_hours <= 3) reasons.push(row.tz_gap_hours < 0.5 ? "your time zone" : "close to your time zone");
    if (row.day_match && viewer.days.length && row.starts_at) {
      const code = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date(new Date(row.starts_at).toLocaleString("en-US", { timeZone: row.timezone || "UTC" })).getDay()];
      if (code && viewer.days.includes(code)) reasons.push(`fits your ${DAY_FULL[code]}`);
    }
    if (row.category_match && !reasons.length) reasons.push(`${row.category_label.toLowerCase()} — a cause you picked`);
  }
  const warnings: string[] = [];
  if (row.requires_car && !viewer.hasCar) warnings.push("needs a car");
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    category_label: row.category_label,
    mode: row.mode,
    public_area: row.mode === "remote" ? null : row.public_area,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    schedule_type: row.schedule_type,
    recurrence_rule: row.recurrence_rule,
    timezone: row.timezone,
    duration_minutes: row.duration_minutes,
    apply_by: row.apply_by,
    volunteers_needed: row.volunteers_needed,
    spots_left: Math.max(0, Number(row.volunteers_needed) - Number(row.accepted_count)),
    status: row.status,
    urgency: row.urgency,
    required_skills: row.required_skills,
    nice_to_have_skills: row.nice_to_have_skills,
    is_sensitive: row.is_sensitive,
    organization_name: row.organization_name,
    organization_slug: row.organization_slug,
    organization_verified: row.organization_verified,
    posted_by: row.organization_name || row.requester_display_name,
    // Whole miles only, from the geocoded public area — never precise enough to locate an address.
    distance_miles: row.distance_miles == null ? null : Math.max(1, Math.round(Number(row.distance_miles))),
    match: viewer.id ? { score: Math.round(Number(row.score) * 10) / 10, reasons, warnings } : null,
    published_at: row.published_at
  };
}
