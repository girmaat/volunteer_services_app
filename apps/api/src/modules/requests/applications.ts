/**
 * One place to call after an application changes state: notifies the volunteer, asks for reviews
 * when work is completed, and re-syncs the request (open / pending / filled, waitlist promotion).
 */
import { pool } from "../../lib/db";
import { enqueue } from "../../jobs/queue";
import { hasOpenSlot, syncStaffing } from "./lifecycle";

export async function afterApplicationUpdate(applicationId: string, status: string, actorUserId: string | null) {
  const r = await pool.query("SELECT request_id FROM request_applications WHERE id = $1", [applicationId]);
  const requestId = r.rows[0]?.request_id ? String(r.rows[0].request_id) : null;
  if (!requestId) return;
  if (["accepted", "waitlisted", "rejected"].includes(status)) await enqueue("notify.application_status", { applicationId, status });
  if (status === "completed") {
    await pool.query("UPDATE request_applications SET completed_at = COALESCE(completed_at, NOW()) WHERE id = $1", [applicationId]);
    await enqueue("notify.review_requested", { applicationId });
  }
  await syncStaffing(requestId, { userId: actorUserId, kind: actorUserId ? "user" : "system" });
}

/** True when the request behind this application still has a free spot. */
export async function applicationHasSlot(applicationId: string) {
  const r = await pool.query("SELECT request_id FROM request_applications WHERE id = $1", [applicationId]);
  if (!r.rowCount) return false;
  return hasOpenSlot(String(r.rows[0].request_id));
}

export const FULL_MESSAGE = "Every spot is filled. Waitlist this volunteer, or raise the number of volunteers needed first.";
