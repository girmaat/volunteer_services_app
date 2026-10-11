import { ensureUserGeo } from "../geo";
import { enqueue } from "../jobs/queue";
import { pool } from "./db";

/**
 * Distance features read only what is already geocoded. A missing user location is queued for
 * geocoding so the next request can use it; the request itself never waits on Nominatim.
 */
export async function cachedUserGeo(userId: string) {
  const geo = await ensureUserGeo(pool, userId, { allowFetch: false }).catch(() => null);
  if (!geo) await enqueue("geocode.user", { userId }, { singletonKey: `user:${userId}` });
  return geo;
}

/** Kept for compatibility: backfill now runs as a scheduled job (see jobs/queue.ts). */
export function startGeoBackfill() {
  /* scheduled via pg-boss */
}
