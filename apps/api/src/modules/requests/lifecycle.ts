/**
 * Request lifecycle (Phase 4.3): one transition function, one table of allowed moves, one audit row
 * per change. Handlers never write service_requests.status directly.
 *
 *   draft ──publish──▶ open ──(first accept)──▶ pending ──(all slots)──▶ filled
 *     ▲  (sensitive: review first)   ▲  │                    ▲   │
 *     └──reject/approve (admin)      │  └──────pause/resume───┘   └─(a spot opens: offered to the next waitlisted person)
 *   any live state ──cancel / take_down──▶ canceled          pending|filled ──complete──▶ completed
 */
import type { Pool, PoolClient } from "pg";
import { pool as defaultPool } from "../../lib/db";
import { enqueue } from "../../jobs/queue";
import { calendarChanged } from "../calendar/updates";

export type RequestStatus = "draft" | "open" | "pending" | "filled" | "paused" | "completed" | "canceled";
export type RequestEvent =
  | "publish"
  | "approve"
  | "reject"
  | "pause"
  | "resume"
  | "staffing"
  | "complete"
  | "cancel"
  | "take_down"
  | "restore";

export type Actor = { userId: string | null; kind: "user" | "admin" | "system" };

/** Allowed source states per event. Target state is decided in `transitionRequest`. */
export const TRANSITIONS: Record<RequestEvent, RequestStatus[]> = {
  publish: ["draft"],
  approve: ["draft"],
  reject: ["draft"],
  pause: ["open", "pending", "filled"],
  resume: ["paused"],
  staffing: ["open", "pending", "filled"],
  complete: ["pending", "filled", "open", "paused"],
  cancel: ["draft", "open", "pending", "filled", "paused"],
  take_down: ["draft", "open", "pending", "filled", "paused"],
  restore: ["canceled"]
};

/** Actions an owner can take from each state (drives which buttons the UI shows). */
export function ownerActions(status: string, reviewStatus: string): RequestEvent[] {
  const out: RequestEvent[] = [];
  if (status === "draft" && reviewStatus !== "pending_review") out.push("publish");
  if (["open", "pending", "filled"].includes(status)) out.push("pause");
  if (status === "paused") out.push("resume");
  if (["pending", "filled"].includes(status)) out.push("complete");
  if (TRANSITIONS.cancel.includes(status as RequestStatus)) out.push("cancel");
  return out;
}

export class TransitionError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

type Db = Pool | PoolClient;

export type StaffingCounts = {
  accepted: number;
  needed: number;
  waitlisted: number;
  /** Spots offered to waitlisted volunteers, waiting for their answer (they hold the spot). */
  offered: number;
  /** Target and unit (REQ-05/06): accepted commitments in the target unit, kept apart from delivered work. */
  target: number | null;
  unit: string | null;
  committed: number;
  allowOverfill: boolean;
};

export async function staffingCounts(db: Db, requestId: string): Promise<StaffingCounts> {
  const r = await db.query(
    `SELECT r.volunteers_needed AS needed, r.target_value::float AS target, r.target_unit AS unit, r.allow_overfill,
            COUNT(a.id) FILTER (WHERE a.status IN ('accepted', 'confirmed', 'completed'))::int AS accepted,
            COUNT(a.id) FILTER (WHERE a.status = 'waitlisted')::int AS waitlisted,
            COUNT(a.id) FILTER (WHERE a.status = 'offered')::int AS offered,
            COALESCE(SUM(COALESCE(a.accepted_amount, a.offered_amount)) FILTER (WHERE a.status IN ('accepted', 'confirmed', 'completed')), 0)::float AS committed
       FROM service_requests r
       LEFT JOIN request_applications a ON a.request_id = r.id
      WHERE r.id = $1
      GROUP BY r.id`,
    [requestId]
  );
  const row = r.rows[0] || { needed: 1, accepted: 0, waitlisted: 0, offered: 0, target: null, unit: null, committed: 0, allow_overfill: false };
  return {
    needed: Number(row.needed),
    accepted: Number(row.accepted),
    waitlisted: Number(row.waitlisted),
    offered: Number(row.offered),
    target: row.target == null ? null : Number(row.target),
    unit: row.unit ?? null,
    committed: Number(row.committed || 0),
    allowOverfill: Boolean(row.allow_overfill)
  };
}

/** The target is met and no more is wanted. */
export const targetMet = (c: StaffingCounts) => c.target != null && !c.allowOverfill && c.committed >= c.target;

function staffedStatus(c: StaffingCounts): RequestStatus {
  if (c.accepted >= c.needed || targetMet(c)) return "filled";
  if (c.accepted > 0) return "pending";
  return "open";
}

async function audit(db: Db, requestId: string, event: string, from: string | null, to: string, actor: Actor, reason?: string | null) {
  await db.query(
    `INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_user_id, actor_kind, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [requestId, event, from, to, actor.userId, actor.kind, reason ?? null]
  );
}

export type TransitionResult = { id: string; from: RequestStatus; to: RequestStatus; review_status: string; event: RequestEvent; changed: boolean };

/**
 * Applies `event` to a request inside a transaction (row locked), writes the audit row and
 * queues side effects. Throws TransitionError (409/422) for moves the table doesn't allow.
 */
export async function transitionRequest(
  requestId: string,
  event: RequestEvent,
  actor: Actor,
  opts: { reason?: string | null; pool?: Pool } = {}
): Promise<TransitionResult> {
  const pool = opts.pool ?? defaultPool;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const res = await transitionWithClient(c, requestId, event, actor, opts.reason ?? null);
    await c.query("COMMIT");
    if (res.changed) await afterTransition(res, actor, opts.reason ?? null);
    return res;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function transitionWithClient(c: PoolClient, requestId: string, event: RequestEvent, actor: Actor, reason: string | null): Promise<TransitionResult> {
  const cur = await c.query(
    `SELECT r.id, r.status, r.review_status, r.is_sensitive, r.category, r.requester_user_id, r.requester_org_slug,
            r.title, r.description, r.mode, r.public_area, r.starts_at, r.ends_at, r.schedule_type, r.removed_at,
            r.requires_waiver, r.requires_training
       FROM service_requests r WHERE r.id = $1 FOR UPDATE`,
    [requestId]
  );
  if (!cur.rowCount) throw new TransitionError(404, "not_found", "Request not found");
  const row = cur.rows[0];
  const from = row.status as RequestStatus;
  const allowed = TRANSITIONS[event];
  if (!allowed.includes(from)) {
    throw new TransitionError(409, "invalid_transition", `Can't ${event.replace("_", " ")} a request that is ${from}`);
  }

  let to: RequestStatus = from;
  let review = String(row.review_status);
  const sets: string[] = [];

  switch (event) {
    case "publish": {
      const missing = publishProblems(row);
      if (missing.length) throw new TransitionError(422, "incomplete", `Add ${missing.join(", ")} before publishing`);
      const forms = await formProblems(c, row);
      if (forms.length) throw new TransitionError(422, "forms_missing", forms.join("; "));
      if (review === "pending_review") throw new TransitionError(409, "in_review", "This request is already waiting for review");
      if (row.is_sensitive) {
        // Sensitive categories wait for an admin; status stays draft until approved.
        review = "pending_review";
        sets.push("review_status = 'pending_review'", "review_notes = NULL");
        await audit(c, requestId, "submit_for_review", from, from, actor, reason);
        await c.query(`UPDATE service_requests SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, [requestId]);
        return { id: requestId, from, to: from, review_status: review, event, changed: true };
      }
      to = "open";
      sets.push("published_at = COALESCE(published_at, NOW())", "review_status = 'approved'");
      review = "approved";
      break;
    }
    case "approve":
      if (review !== "pending_review") throw new TransitionError(409, "not_in_review", "This request isn't waiting for review");
      to = "open";
      review = "approved";
      sets.push("review_status = 'approved'", "reviewed_at = NOW()", "reviewed_by_user_id = $2", "published_at = COALESCE(published_at, NOW())", "review_notes = $3");
      break;
    case "reject":
      if (review !== "pending_review") throw new TransitionError(409, "not_in_review", "This request isn't waiting for review");
      to = "draft";
      review = "rejected";
      sets.push("review_status = 'rejected'", "reviewed_at = NOW()", "reviewed_by_user_id = $2", "review_notes = $3");
      break;
    case "pause":
      to = "paused";
      break;
    case "resume":
    case "staffing":
      to = staffedStatus(await staffingCounts(c, requestId));
      if (to === "filled" && from !== "filled") sets.push("filled_at = NOW()");
      break;
    case "complete":
      to = "completed";
      sets.push("completed_at = NOW()");
      break;
    case "cancel":
      if (!reason || !reason.trim()) throw new TransitionError(422, "reason_required", "Give a reason so applicants know why");
      to = "canceled";
      sets.push("canceled_at = NOW()", "cancel_reason = $3");
      break;
    case "take_down":
      if (!reason || !reason.trim()) throw new TransitionError(422, "reason_required", "A take-down needs a reason");
      to = "canceled";
      sets.push("canceled_at = NOW()", "cancel_reason = $3", "removed_at = NOW()", "removed_reason = $3", "removed_by_user_id = $2");
      break;
    case "restore":
      if (!row.removed_at) throw new TransitionError(409, "not_removed", "Only taken-down requests can be restored");
      to = staffedStatus(await staffingCounts(c, requestId));
      sets.push("canceled_at = NULL", "cancel_reason = NULL", "removed_at = NULL", "removed_reason = NULL", "removed_by_user_id = NULL");
      break;
  }

  const changed = to !== from || sets.length > 0;
  if (!changed) return { id: requestId, from, to, review_status: review, event, changed: false };

  // $2 = actor, $3 = reason; the WHERE clause types them even when a SET doesn't use them.
  await c.query(
    `UPDATE service_requests SET ${["status = '" + to + "'", ...sets].join(", ")}, updated_at = NOW()
      WHERE id = $1 AND ($2::uuid IS NULL OR TRUE) AND ($3::text IS NULL OR TRUE)`,
    [requestId, actor.userId, reason]
  );

  if (to === "canceled") {
    // Everyone still in play is told the request is off.
    await c.query(
      `UPDATE request_applications SET status = 'canceled', status_updated_at = NOW(), status_updated_by_user_id = $2, updated_at = NOW()
        WHERE request_id = $1 AND status IN ('pending', 'waitlisted', 'accepted', 'confirmed')`,
      [requestId, actor.userId]
    );
    await c.query("UPDATE request_commitments SET status = 'canceled', updated_at = NOW() WHERE request_id = $1 AND status IN ('scheduled', 'confirmed')", [requestId]);
  }

  if (to !== from || event !== "staffing") await audit(c, requestId, event, from, to, actor, reason);
  return { id: requestId, from, to, review_status: review, event, changed: to !== from || event !== "staffing" };
}

/** Fields a request needs before it can go live. */
export function publishProblems(row: Record<string, any>): string[] {
  const missing: string[] = [];
  if (!String(row.title || "").trim()) missing.push("a title");
  if (!String(row.description || "").trim()) missing.push("a description");
  if (!row.category) missing.push("a category");
  if (row.mode !== "remote" && !String(row.public_area || "").trim()) missing.push("an area (city or neighborhood)");
  if (row.schedule_type === "one_time" && !row.starts_at) missing.push("a date and time");
  return missing;
}

/**
 * "Waiver required" and "training required" must point at a real form the volunteer signs; otherwise
 * the flag promises a check nobody can complete. Individual requests have no forms, so they can't set them.
 */
export async function formProblems(db: Db, row: Record<string, any>): Promise<string[]> {
  const need = [row.requires_waiver ? "waiver" : null, row.requires_training ? "training" : null].filter(Boolean) as string[];
  if (!need.length) return [];
  if (!row.requester_org_slug) return ["Only organizations can require a waiver or training. Turn those off, or describe what you need in the details"];
  const have = await db.query(
    `SELECT DISTINCT d.doc_type FROM org_documents d JOIN org_document_assignments a ON a.org_document_id = d.id
      WHERE d.org_slug = $1 AND d.active AND d.require_ack AND d.doc_type = ANY($2::text[]) AND (a.request_id = $3 OR a.request_id IS NULL)`,
    [row.requester_org_slug, need, row.id]
  );
  const got = new Set(have.rows.map((r: { doc_type: string }) => r.doc_type));
  return need.filter((t) => !got.has(t)).map((t) => (t === "waiver" ? "Attach a waiver form under Organization → Documents (this request says a waiver is required)" : "Attach a training document under Organization → Documents (this request says training is required)"));
}

async function afterTransition(res: TransitionResult, actor: Actor, reason: string | null) {
  if ((res.event === "publish" || res.event === "approve") && res.to === "open") {
    // Geocode the public area (never the exact address) so "Near you" and distances work.
    const loc = await defaultPool.query("SELECT mode, public_area, location_lat FROM service_requests WHERE id = $1", [res.id]);
    const l = loc.rows[0];
    if (l && l.mode !== "remote" && l.public_area && l.location_lat == null) await enqueue("geocode.request", { requestId: res.id, locationText: String(l.public_area) });
  }
  if (res.to === "filled" && res.from !== "filled") await enqueue("notify.request_filled", { requestId: res.id });
  if (res.to === "canceled") {
    await enqueue("notify.request_canceled", { requestId: res.id, reason, byAdmin: actor.kind === "admin" });
    const shifts = await defaultPool.query(
      "SELECT id FROM request_commitments WHERE request_id = $1 AND status = 'canceled' AND start_at IS NOT NULL AND updated_at > NOW() - INTERVAL '5 minutes'",
      [res.id]
    );
    await calendarChanged(shifts.rows.map((r) => String(r.id)), "cancel");
  }
  if (res.event === "publish" && res.review_status === "pending_review") await enqueue("notify.request_needs_review", { requestId: res.id });
  if (res.event === "approve" || res.event === "reject") await enqueue("notify.request_reviewed", { requestId: res.id, approved: res.event === "approve", reason });
}

/**
 * Call after any application/commitment change. While spots are open, offers the oldest waitlisted
 * applicant a spot (they have 24 hours to accept; nobody is placed without saying yes, REQ-07), then
 * moves the request between open / pending / filled.
 */
export async function syncStaffing(requestId: string, actor: Actor = { userId: null, kind: "system" }): Promise<TransitionResult | null> {
  const c = await defaultPool.connect();
  const offered: string[] = [];
  let res: TransitionResult | null = null;
  try {
    await c.query("BEGIN");
    const cur = await c.query("SELECT status FROM service_requests WHERE id = $1 FOR UPDATE", [requestId]);
    if (!cur.rowCount) {
      await c.query("ROLLBACK");
      return null;
    }
    const status = cur.rows[0].status as RequestStatus;
    if (!TRANSITIONS.staffing.includes(status)) {
      await c.query("COMMIT");
      return null;
    }
    let counts = await staffingCounts(c, requestId);
    while (counts.accepted + counts.offered < counts.needed && !targetMet(counts) && counts.waitlisted > 0) {
      const next = await c.query(
        `UPDATE request_applications SET status = 'offered', offer_expires_at = NOW() + INTERVAL '24 hours', status_updated_at = NOW(), status_updated_by_user_id = NULL, updated_at = NOW()
          WHERE id = (SELECT id FROM request_applications WHERE request_id = $1 AND status = 'waitlisted' ORDER BY created_at LIMIT 1)
          RETURNING id`,
        [requestId]
      );
      if (!next.rowCount) break;
      offered.push(String(next.rows[0].id));
      await audit(c, requestId, "waitlist_offered", status, status, { userId: null, kind: "system" }, `A spot was offered to application ${next.rows[0].id}`);
      counts = await staffingCounts(c, requestId);
    }
    res = await transitionWithClient(c, requestId, "staffing", actor, null);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  for (const id of offered) await enqueue("notify.application_status", { applicationId: id, status: "offered" });
  if (res?.changed) await afterTransition(res, actor, null);
  return res;
}

/** Guard used before accepting: refuses when every slot is already taken. */
export async function hasOpenSlot(requestId: string): Promise<boolean> {
  const c = await staffingCounts(defaultPool, requestId);
  return c.accepted + c.offered < c.needed;
}

/**
 * SQL predicate for requests anyone may discover: live, approved, not taken down, and not posted
 * by a shadow-banned account (their content stays visible only to themselves).
 */
export function discoverableSql(alias = "r") {
  return `${alias}.status IN ('open', 'pending') AND ${alias}.review_status = 'approved' AND ${alias}.removed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM users sb WHERE sb.id = ${alias}.requester_user_id AND sb.shadow_banned)
    AND NOT EXISTS (SELECT 1 FROM organizations so WHERE so.slug = ${alias}.requester_org_slug AND (so.suspended_at IS NOT NULL OR so.verification_status IN ('needs_info', 'rejected', 'suspended')))`;
}
