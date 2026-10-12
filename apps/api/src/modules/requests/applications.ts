/**
 * One place to call after an application changes state: notifies the volunteer, asks for reviews
 * when work is completed, and re-syncs the request (open / pending / filled, waitlist promotion).
 */
import { pool } from "../../lib/db";
import { enqueue } from "../../jobs/queue";
import { hasOpenSlot, staffingCounts, syncStaffing } from "./lifecycle";
import { contributionFromCompletion } from "../contributions/service";

export async function afterApplicationUpdate(applicationId: string, status: string, actorUserId: string | null) {
  const r = await pool.query("SELECT request_id FROM request_applications WHERE id = $1", [applicationId]);
  const requestId = r.rows[0]?.request_id ? String(r.rows[0].request_id) : null;
  if (!requestId) return;
  if (["accepted", "waitlisted", "rejected", "offered"].includes(status)) await enqueue("notify.application_status", { applicationId, status });
  if (status === "completed") {
    await pool.query("UPDATE request_applications SET completed_at = COALESCE(completed_at, NOW()) WHERE id = $1", [applicationId]);
    await enqueue("notify.review_requested", { applicationId });
    // No attendance was taken: the scheduled time goes to the reviewer as pending hours.
    await contributionFromCompletion(applicationId, actorUserId);
    const v = await pool.query("SELECT volunteer_user_id FROM request_applications WHERE id = $1", [applicationId]);
    if (v.rows[0]) await enqueue("badges.award", { userId: String(v.rows[0].volunteer_user_id) });
  }
  await syncStaffing(requestId, { userId: actorUserId, kind: actorUserId ? "user" : "system" });
}

/** True when the request behind this application still has a free spot. */
export async function applicationHasSlot(applicationId: string) {
  const r = await pool.query("SELECT request_id FROM request_applications WHERE id = $1", [applicationId]);
  if (!r.rowCount) return false;
  return hasOpenSlot(String(r.rows[0].request_id));
}

export const FULL_MESSAGE = "Every spot is filled or offered. Waitlist this volunteer, or raise the number of volunteers needed first.";

export type AcceptCheck =
  | { ok: true; acceptedAmount: number | null }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

/**
 * The one rule for accepting a volunteer, used by every accept path (owner view, org team PATCH,
 * requester inbox): a free spot (unless the spot was already offered to them), and on requests with a
 * goal, an accepted amount that fits what they offered and what's left of the goal (REQ-05).
 */
export async function checkAccept(applicationId: string, requestedAmount?: number | null): Promise<AcceptCheck> {
  const a = (await pool.query("SELECT status, request_id, offered_amount::float AS offered_amount FROM request_applications WHERE id = $1", [applicationId])).rows[0];
  if (!a) return { ok: false, status: 404, code: "not_found", message: "Applicant not found" };
  if (a.status !== "offered" && !(await hasOpenSlot(String(a.request_id)))) return { ok: false, status: 409, code: "full", message: FULL_MESSAGE };
  const s = await staffingCounts(pool, String(a.request_id));
  if (s.target == null) return { ok: true, acceptedAmount: null };
  const remaining = Math.max(0, Math.round((s.target - s.committed) * 100) / 100);
  const offered = a.offered_amount as number | null;
  const amount = requestedAmount ?? (offered != null ? (s.allowOverfill ? offered : Math.min(offered, remaining)) : null);
  if (amount == null || amount <= 0) {
    return { ok: false, status: 409, code: "target_met", message: `The goal of ${s.target} ${s.unit} is already committed. Turn on “accept more than the goal” to take more.` };
  }
  if (offered != null && amount > offered) return { ok: false, status: 422, code: "over_offer", message: `They offered ${offered} ${s.unit}; you can accept that much or less` };
  if (!s.allowOverfill && amount > remaining) {
    return { ok: false, status: 409, code: "over_target", message: `Only ${remaining} ${s.unit} of the goal ${remaining === 1 ? "is" : "are"} left. Accept part of their offer.` };
  }
  return { ok: true, acceptedAmount: amount };
}

export const acceptError = (c: Extract<AcceptCheck, { ok: false }>) => ({ error: { code: c.code, message: c.message }, message: c.message });
