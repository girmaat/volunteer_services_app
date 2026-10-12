/**
 * Hourly housekeeping (pg-boss schedule "maintenance.hourly"): archive old conversations,
 * complete requests whose work is done, and anything else time-based.
 */
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { hourlyMaintenance as archiveConversations } from "../modules/messaging/jobs";
import { transitionRequest, TransitionError } from "../modules/requests/lifecycle";
import { expireOffers } from "../modules/requests/offers";

const extra = new Set<() => Promise<unknown>>();
/** Lets other modules (reviews) add hourly work without import cycles. */
export function onHourly(fn: () => Promise<unknown>) {
  extra.add(fn);
}

/** Requests past their end time where every accepted volunteer is marked complete. */
export async function autoCompleteRequests() {
  const r = await pool.query(
    `SELECT r.id FROM service_requests r
      WHERE r.status IN ('pending', 'filled') AND COALESCE(r.ends_at, r.starts_at) < NOW() - INTERVAL '6 hours'
        AND EXISTS (SELECT 1 FROM request_applications a WHERE a.request_id = r.id AND a.status = 'completed')
        AND NOT EXISTS (SELECT 1 FROM request_applications a WHERE a.request_id = r.id AND a.status IN ('accepted', 'confirmed'))`
  );
  let n = 0;
  for (const row of r.rows) {
    try {
      await transitionRequest(String(row.id), "complete", { userId: null, kind: "system" }, { reason: "All volunteers checked out" });
      n++;
    } catch (e) {
      if (!(e instanceof TransitionError)) throw e;
    }
  }
  return n;
}

/**
 * Accounts nobody verified within 7 days are removed, so an email address can't be held by someone
 * who signed up with it but never proved they own it.
 */
export async function purgeUnverifiedAccounts() {
  const r = await pool.query(
    `DELETE FROM users u WHERE u.email_verified_at IS NULL AND u.created_at < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM platform_admins p WHERE p.user_id = u.id)`
  );
  return r.rowCount ?? 0;
}

export async function runHourly() {
  const out: Record<string, unknown> = {};
  out.archived = (await archiveConversations()).archived;
  out.completed = await autoCompleteRequests();
  out.offers_expired = await expireOffers();
  out.unverified_purged = await purgeUnverifiedAccounts();
  for (const fn of extra) await fn();
  logger.info(out, "hourly maintenance");
  return out;
}
