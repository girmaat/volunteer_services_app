import type { Pool } from "pg";

export type GeoPoint = { lat: number; lng: number };

const DEFAULT_CACHE_TTL_DAYS = 180;

function normalizeQuery(q: string) {
  return (q || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const FAILURE_RETRY_DAYS = 7;
const NOMINATIM_MIN_INTERVAL_MS = 1100; // Nominatim usage policy: max 1 request per second
let nominatimChain: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

/** Serialises calls so the whole process never exceeds 1 request/second to Nominatim. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimChain.then(async () => {
    const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    return fn();
  });
  nominatimChain = run.catch(() => undefined);
  return run;
}

async function fetchNominatim(query: string): Promise<GeoPoint | null> {
  if (process.env.GEOCODING_DISABLED === "true") return null;
  return throttled(() => fetchNominatimNow(query));
}

async function fetchNominatimNow(query: string): Promise<GeoPoint | null> {
  const q = encodeURIComponent(query);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`;

  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(4000),
    headers: {
      // Nominatim usage policy requires a valid User-Agent.
      "user-agent": "ThankYouApp/1.0 (volunteer-app)",
      accept: "application/json"
    }
  });

  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as any;
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

export async function geocodeWithCache(
  pool: Pool,
  rawQuery: string,
  opts?: { ttlDays?: number; allowFetch?: boolean }
): Promise<GeoPoint | null> {
  const q = normalizeQuery(rawQuery);
  if (!q) return null;

  const ttlDays = clamp(opts?.ttlDays ?? DEFAULT_CACHE_TTL_DAYS, 1, 3650);

  const cached = await pool.query(
    `
    SELECT lat, lng, updated_at, failed_at
    FROM geo_cache
    WHERE query = $1
    `,
    [q]
  );

  if ((cached.rowCount ?? 0) > 0) {
    const row = cached.rows[0];
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && row.updated_at) {
      const updatedAt = new Date(row.updated_at as string).getTime();
      const ageDays = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
      if (ageDays <= ttlDays) return { lat, lng };
    }
    if (row.failed_at) {
      const failedDays = (Date.now() - new Date(row.failed_at as string).getTime()) / (1000 * 60 * 60 * 24);
      if (failedDays < FAILURE_RETRY_DAYS) return null;
    }
  }

  if (opts?.allowFetch === false) return null;

  const fresh = await fetchNominatim(rawQuery).catch(() => null);
  if (!fresh) {
    await pool.query(
      `INSERT INTO geo_cache (query, lat, lng, updated_at, failed_at)
       VALUES ($1, NULL, NULL, NOW(), NOW())
       ON CONFLICT (query) DO UPDATE SET failed_at = NOW()`,
      [q]
    );
    return null;
  }

  await pool.query(
    `
    INSERT INTO geo_cache (query, lat, lng, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (query) DO UPDATE SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      updated_at = NOW(),
      failed_at = NULL
    `,
    [q, fresh.lat, fresh.lng]
  );

  return fresh;
}

export async function ensureUserGeo(pool: Pool, userId: string, opts?: { allowFetch?: boolean }): Promise<GeoPoint | null> {
  const rows = await pool.query(
    `
    SELECT geo_lat, geo_lng, public_location, location
    FROM user_profiles
    WHERE user_id = $1
    `,
    [userId]
  );

  if ((rows.rowCount ?? 0) === 0) return null;
  const r = rows.rows[0];

  const lat = Number(r.geo_lat);
  const lng = Number(r.geo_lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };

  const label = String(r.public_location || r.location || "").trim();
  if (!label) return null;

  const geo = await geocodeWithCache(pool, label, { allowFetch: opts?.allowFetch });
  if (!geo) return null;

  await pool.query(
    `UPDATE user_profiles SET geo_lat=$2, geo_lng=$3, geo_updated_at=NOW(), updated_at=NOW() WHERE user_id=$1`,
    [userId, geo.lat, geo.lng]
  );

  return geo;
}

export async function ensureServiceRequestGeo(
  pool: Pool,
  requestId: string,
  locationText: string | null
): Promise<GeoPoint | null> {
  const existing = await pool.query(
    `SELECT location_lat, location_lng FROM service_requests WHERE id=$1`,
    [requestId]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const r = existing.rows[0];
    const lat = Number(r.location_lat);
    const lng = Number(r.location_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  const label = String(locationText || "").trim();
  if (!label) return null;

  const geo = await geocodeWithCache(pool, label);
  if (!geo) return null;

  await pool.query(
    `UPDATE service_requests SET location_lat=$2, location_lng=$3, updated_at=NOW() WHERE id=$1`,
    [requestId, geo.lat, geo.lng]
  );

  return geo;
}

export async function backfillRecentServiceRequestGeo(
  pool: Pool,
  opts?: { limit?: number }
): Promise<number> {
  const limit = clamp(opts?.limit ?? 20, 0, 100);
  if (limit <= 0) return 0;

  const rows = await pool.query(
    `
    SELECT id, location_text
    FROM service_requests
    WHERE
      status IN ('open', 'pending', 'filled')
      AND COALESCE(mode, 'remote') <> 'remote'
      AND COALESCE(location_text, '') <> ''
      AND (location_lat IS NULL OR location_lng IS NULL)
    ORDER BY updated_at DESC
    LIMIT $1
    `,
    [limit]
  );

  let updated = 0;
  for (const r of rows.rows as any[]) {
    const geo = await ensureServiceRequestGeo(pool, String(r.id), String(r.location_text || ""));
    if (geo) updated += 1;
  }

  return updated;
}
