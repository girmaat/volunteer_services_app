/**
 * Contributions: one row per piece of service a volunteer gave, with the hours (and units) they
 * reported and the hours an authorized reviewer approved. Every decision is a new row in
 * contribution_decisions (append-only), so corrections never overwrite history (DATA-04).
 *
 *   check-out / marked complete / volunteer report ──▶ pending ──approve──▶ approved
 *                                                       │  ├──adjust──▶ adjusted (reason kept)
 *                                                       │  ├──reject──▶ rejected (reason kept)
 *                                                       │  └──request revision──▶ revision_requested ──resubmit──▶ pending
 *   approved | adjusted | rejected ──volunteer disputes──▶ disputed ──another reviewer decides / platform staff──▶ …
 *   outside service (no request) ──▶ self_reported (never approved: nobody here can confirm it)
 *
 * Rules: nobody reviews their own service; staff who declared a conflict can't review that
 * volunteer; only verified, active organizations approve; credited time can't overlap.
 */
import type { PoolClient } from "pg";
import { pool } from "../../lib/db";
import { orgMembership, type PolicyUser } from "../../lib/policy";
import { notify } from "../notifications/service";

export type ContributionStatus = "self_reported" | "pending" | "approved" | "adjusted" | "rejected" | "revision_requested" | "disputed" | "unverified";
export type Method = "staff_check_in" | "qr_check_in" | "manual_attendance" | "marked_complete" | "volunteer_report" | "self_reported";
export type Decision = "approve" | "adjust" | "reject" | "request_revision";

export const CREDITED: ContributionStatus[] = ["approved", "adjusted"];

/** How each verification method reads on the record and the verification page (CON-07: never "all equivalent"). */
export const METHOD_LABEL: Record<Method, string> = {
  staff_check_in: "Checked in and out by organization staff",
  qr_check_in: "Volunteer scanned the on-site check-in code; hours approved by staff",
  manual_attendance: "Attendance entered by organization staff",
  marked_complete: "Marked complete by the organizer; scheduled time",
  volunteer_report: "Reported by the volunteer",
  self_reported: "Self-reported; not confirmed by anyone"
};

export class ContributionError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hours between two times minus a break, rounded to 0.01. */
export function hoursBetween(start: Date, end: Date, breakMinutes = 0) {
  return Math.max(0, round2((end.getTime() - start.getTime()) / 3_600_000 - breakMinutes / 60));
}

type Db = PoolClient | typeof pool;

async function log(db: Db, contributionId: string, actorUserId: string | null, actorRole: string, action: string, opts: { hours?: number | null; units?: number | null; reason?: string | null } = {}) {
  await db.query(
    "INSERT INTO contribution_decisions (contribution_id, actor_user_id, actor_role, action, hours, units, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [contributionId, actorUserId, actorRole, action, opts.hours ?? null, opts.units ?? null, opts.reason ?? null]
  );
}

/** True when [start, end) overlaps time already credited (or, with includePending, waiting) for this volunteer. */
export async function overlaps(db: Db, volunteerId: string, start: Date | null, end: Date | null, exceptId: string | null, includePending = false) {
  if (!start || !end) return false;
  const statuses = includePending ? ["approved", "adjusted", "pending", "disputed"] : ["approved", "adjusted"];
  const r = await db.query(
    `SELECT 1 FROM contributions
      WHERE volunteer_user_id = $1 AND status = ANY($2::text[]) AND ($3::uuid IS NULL OR id <> $3)
        AND started_at IS NOT NULL AND ended_at IS NOT NULL
        AND tstzrange(started_at, ended_at, '[)') && tstzrange($4::timestamptz, $5::timestamptz, '[)')
      LIMIT 1`,
    [volunteerId, statuses, exceptId, start.toISOString(), end.toISOString()]
  );
  return Boolean(r.rowCount);
}

export type NewContribution = {
  volunteerUserId: string;
  requestId?: string | null;
  applicationId?: string | null;
  source: "check_in" | "completion" | "volunteer_report" | "outside";
  method: Method;
  attendanceLogId?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  breakMinutes?: number;
  hours?: number | null;
  units?: number | null;
  description?: string | null;
  actorUserId: string | null;
  actorRole: string;
};

/** Creates a contribution (pending, or self_reported when nothing can confirm it) and tells the reviewers. */
export async function createContribution(c: NewContribution): Promise<string> {
  let orgSlug: string | null = null;
  let unit: string | null = null;
  let tz: string | null = null;
  if (c.requestId) {
    const r = await pool.query("SELECT requester_org_slug, target_unit, timezone FROM service_requests WHERE id = $1", [c.requestId]);
    orgSlug = r.rows[0]?.requester_org_slug ?? null;
    unit = r.rows[0]?.target_unit && r.rows[0].target_unit !== "hours" ? String(r.rows[0].target_unit) : null;
    tz = r.rows[0]?.timezone ?? null;
  }
  const hours = c.hours ?? (c.startedAt && c.endedAt ? hoursBetween(c.startedAt, c.endedAt, c.breakMinutes ?? 0) : null);
  const status: ContributionStatus = c.source === "outside" || !c.requestId ? "self_reported" : "pending";
  const flagged = await overlaps(pool, c.volunteerUserId, c.startedAt ?? null, c.endedAt ?? null, null, true);
  const ins = await pool.query(
    `INSERT INTO contributions (volunteer_user_id, request_id, application_id, org_slug, source, attendance_log_id, started_at, ended_at, break_minutes,
                                timezone, reported_hours, reported_units, unit, status, verification_method, description, overlap_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (attendance_log_id) DO NOTHING
     RETURNING id`,
    [
      c.volunteerUserId,
      c.requestId ?? null,
      c.applicationId ?? null,
      orgSlug,
      c.source,
      c.attendanceLogId ?? null,
      c.startedAt?.toISOString() ?? null,
      c.endedAt?.toISOString() ?? null,
      c.breakMinutes ?? 0,
      tz,
      hours,
      c.units ?? null,
      c.units != null ? unit : null,
      status,
      status === "self_reported" ? "self_reported" : c.method,
      c.description ?? null,
      flagged
    ]
  );
  if (!ins.rowCount) {
    // Retries (same attendance log) don't create a second contribution (NFR-03).
    const existing = await pool.query("SELECT id FROM contributions WHERE attendance_log_id = $1", [c.attendanceLogId]);
    return String(existing.rows[0].id);
  }
  const id = String(ins.rows[0].id);
  await log(pool, id, c.actorUserId, c.actorRole, "created", { hours, units: c.units ?? null, reason: c.description ?? null });
  if (status === "pending") await tellReviewers(id);
  return id;
}

/** When an application is marked complete without any recorded attendance, the scheduled time becomes a pending contribution. */
export async function contributionFromCompletion(applicationId: string, actorUserId: string | null) {
  const a = await pool.query(
    `SELECT a.id, a.volunteer_user_id, a.request_id, c.start_at, c.end_at, r.duration_minutes, r.starts_at, r.ends_at
       FROM request_applications a
       JOIN service_requests r ON r.id = a.request_id
       LEFT JOIN LATERAL (SELECT start_at, end_at FROM request_commitments c WHERE c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id ORDER BY c.updated_at DESC LIMIT 1) c ON TRUE
      WHERE a.id = $1`,
    [applicationId]
  );
  const row = a.rows[0];
  if (!row) return null;
  const has = await pool.query("SELECT 1 FROM contributions WHERE application_id = $1 AND status <> 'rejected' LIMIT 1", [applicationId]);
  if (has.rowCount) return null;
  const start = row.start_at ? new Date(row.start_at) : row.starts_at ? new Date(row.starts_at) : null;
  let end = row.end_at ? new Date(row.end_at) : row.ends_at ? new Date(row.ends_at) : null;
  if (start && !end) end = new Date(start.getTime() + (Number(row.duration_minutes) || 60) * 60_000);
  const hours = start && end ? hoursBetween(start, end) : round2((Number(row.duration_minutes) || 60) / 60);
  return createContribution({
    volunteerUserId: String(row.volunteer_user_id),
    requestId: String(row.request_id),
    applicationId,
    source: "completion",
    method: "marked_complete",
    startedAt: start,
    endedAt: end,
    hours,
    actorUserId,
    actorRole: "organizer"
  });
}

/** Everyone who may review a contribution: the org's admins and managers, or the individual who posted the request. */
export async function reviewerIds(contributionId: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT c.volunteer_user_id, c.org_slug, r.requester_user_id
       FROM contributions c LEFT JOIN service_requests r ON r.id = c.request_id WHERE c.id = $1`,
    [contributionId]
  );
  const row = r.rows[0];
  if (!row) return [];
  let ids: string[] = [];
  if (row.org_slug) {
    const m = await pool.query(
      `SELECT m.user_id FROM organization_members m
        WHERE m.org_slug = $1 AND m.status = 'active' AND m.role IN ('admin', 'manager') AND m.user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM staff_conflicts s WHERE s.org_slug = m.org_slug AND s.staff_user_id = m.user_id AND s.volunteer_user_id = $2)`,
      [row.org_slug, row.volunteer_user_id]
    );
    ids = m.rows.map((x) => String(x.user_id));
  } else if (row.requester_user_id) ids = [String(row.requester_user_id)];
  return ids.filter((id) => id !== String(row.volunteer_user_id));
}

async function tellReviewers(contributionId: string) {
  const c = await pool.query("SELECT c.org_slug, c.request_id, r.title, c.reported_hours FROM contributions c LEFT JOIN service_requests r ON r.id = c.request_id WHERE c.id = $1", [contributionId]);
  const row = c.rows[0];
  const href = row.org_slug ? "/org/hours" : "/requester/hours";
  for (const uid of await reviewerIds(contributionId)) {
    await notify(uid, "hours", {
      title: `Hours to approve for “${row.title}”`,
      body: row.reported_hours != null ? `${Number(row.reported_hours)} h reported` : "",
      href,
      email: {
        subject: "Volunteer hours are waiting for you",
        heading: "Volunteer hours to approve",
        lines: [`Hours for “${row.title}” are waiting for your approval. Approve, adjust or send them back with a note.`],
        cta: { label: "Review hours", url: href },
        throttleMinutes: 60
      }
    });
  }
}

export type ReviewerCheck = { ok: true; role: string } | { ok: false; status: number; code: string; message: string; log?: "blocked_self" | "blocked_conflict" };

/** Whether this user may decide on this contribution, and in what role. */
export async function checkReviewer(user: PolicyUser, c: Record<string, any>): Promise<ReviewerCheck> {
  if (String(c.volunteer_user_id) === user.id) {
    return { ok: false, status: 403, code: "self_approval", message: "You can't approve your own hours. Another reviewer has to.", log: "blocked_self" };
  }
  if (c.org_slug) {
    const m = orgMembership(user, String(c.org_slug));
    if (!m || (m.role !== "admin" && m.role !== "manager")) return { ok: false, status: 404, code: "not_found", message: "Contribution not found" };
    const org = await pool.query("SELECT verification_status, suspended_at FROM organizations WHERE slug = $1", [c.org_slug]);
    const o = org.rows[0];
    if (!o || o.verification_status !== "approved" || o.suspended_at) {
      return { ok: false, status: 403, code: "org_not_verified", message: "Only verified organizations can approve volunteer hours. Finish verification in Organization settings." };
    }
    const conflict = await pool.query("SELECT relationship FROM staff_conflicts WHERE org_slug = $1 AND staff_user_id = $2 AND volunteer_user_id = $3", [c.org_slug, user.id, c.volunteer_user_id]);
    if (conflict.rowCount) {
      return { ok: false, status: 403, code: "conflict", message: "You declared a conflict with this volunteer, so another reviewer has to decide.", log: "blocked_conflict" };
    }
    return { ok: true, role: m.role === "admin" ? "org_admin" : "org_manager" };
  }
  if (c.request_id) {
    const r = await pool.query("SELECT requester_user_id FROM service_requests WHERE id = $1", [c.request_id]);
    if (String(r.rows[0]?.requester_user_id || "") === user.id) return { ok: true, role: "requester" };
  }
  return { ok: false, status: 404, code: "not_found", message: "Contribution not found" };
}

/** Marks shared records that include this contribution as corrected after issue (REC-03, scenario "supervisor corrects shared hours"). */
async function supersedeRecords(db: Db, contributionId: string) {
  const r = await db.query(
    `UPDATE service_records SET superseded_at = NOW()
      WHERE $1 = ANY(contribution_ids) AND revoked_at IS NULL AND replaced_by_id IS NULL AND superseded_at IS NULL
      RETURNING volunteer_user_id`,
    [contributionId]
  );
  return r.rows.map((x) => String(x.volunteer_user_id));
}

export type DecideInput = { action: Decision; hours?: number | null; units?: number | null; reason?: string | null };

/** One reviewer decision, in a transaction with the row locked (no double decisions on retries). */
export async function decide(user: PolicyUser, id: string, input: DecideInput) {
  const db = await pool.connect();
  let notifyVolunteer: { volunteer: string; title: string; body: string } | null = null;
  let supersededFor: string[] = [];
  let result: Record<string, unknown>;
  try {
    await db.query("BEGIN");
    const cur = await db.query("SELECT * FROM contributions WHERE id = $1 FOR UPDATE", [id]);
    const c = cur.rows[0];
    if (!c) throw new ContributionError(404, "not_found", "Contribution not found");
    const who = await checkReviewer(user, c);
    if (!who.ok) {
      if (who.log) {
        await log(db, id, user.id, "reviewer", who.log, { reason: "Attempted decision blocked" });
        await db.query("COMMIT");
      }
      throw new ContributionError(who.status, who.code, who.message);
    }
    const status = c.status as ContributionStatus;
    const reason = (input.reason ?? "").trim() || null;
    const reported = c.reported_hours != null ? Number(c.reported_hours) : null;
    const reportedUnits = c.reported_units != null ? Number(c.reported_units) : null;

    if (status === "disputed" && c.decided_by_user_id && String(c.decided_by_user_id) === user.id) {
      throw new ContributionError(403, "second_reviewer", "This was disputed after your decision, so another reviewer has to look at it.");
    }
    const correcting = status === "approved" || status === "adjusted" || status === "rejected";
    const open = status === "pending" || status === "disputed";
    if (input.action === "request_revision" && status !== "pending") throw new ContributionError(409, "invalid_state", "You can only send back hours that are waiting for approval");
    if (!open && !correcting) throw new ContributionError(409, "invalid_state", `These hours are ${status.replace("_", " ")} and can't be decided now`);
    if (correcting && !reason) throw new ContributionError(422, "reason_required", "Say why you're correcting an earlier decision");

    let next: ContributionStatus;
    let hours: number | null = null;
    let units: number | null = null;
    let action: string;
    switch (input.action) {
      case "approve":
        if (reported == null && reportedUnits == null) throw new ContributionError(422, "nothing_reported", "There are no hours to approve; adjust with the hours given instead");
        hours = reported;
        units = reportedUnits;
        next = "approved";
        action = correcting ? "corrected" : "approved";
        break;
      case "adjust": {
        hours = input.hours != null ? round2(Number(input.hours)) : reported;
        units = input.units != null ? round2(Number(input.units)) : reportedUnits;
        if (hours == null && units == null) throw new ContributionError(422, "amount_required", "Enter the hours to approve");
        if (hours != null && (hours < 0 || hours > 24)) throw new ContributionError(422, "invalid_hours", "Approved hours must be between 0 and 24");
        if (!reason) throw new ContributionError(422, "reason_required", "Say why the hours changed; the volunteer sees it");
        next = hours === reported && units === reportedUnits ? "approved" : "adjusted";
        action = correcting ? "corrected" : next === "approved" ? "approved" : "adjusted";
        break;
      }
      case "reject":
        if (!reason) throw new ContributionError(422, "reason_required", "Say why; the volunteer sees it and can dispute it");
        next = "rejected";
        action = correcting ? "corrected" : "rejected";
        break;
      case "request_revision":
        if (!reason) throw new ContributionError(422, "reason_required", "Say what needs to change");
        next = "revision_requested";
        action = "revision_requested";
        break;
    }

    // Credited time can't overlap other credited time for the same volunteer (DATA-03, CASE-06).
    if ((next === "approved" || next === "adjusted") && (await overlaps(db, String(c.volunteer_user_id), c.started_at, c.ended_at, id))) {
      await db.query("UPDATE contributions SET overlap_flag = TRUE, updated_at = NOW() WHERE id = $1", [id]);
      await log(db, id, user.id, who.role, "blocked_overlap", { hours, reason: "Overlaps time already credited to this volunteer" });
      await db.query("COMMIT");
      throw new ContributionError(409, "overlap", "These hours overlap time already credited to this volunteer. Adjust the times, or reject this entry with a note.");
    }

    const credited = next === "approved" || next === "adjusted";
    await db.query(
      `UPDATE contributions SET status = $2, approved_hours = $3, approved_units = $4, decided_at = NOW(), decided_by_user_id = $5, decided_by_role = $6, updated_at = NOW()
        WHERE id = $1`,
      [id, next, credited ? hours : null, credited ? units : null, user.id, who.role]
    );
    await log(db, id, user.id, who.role, action, { hours: credited ? hours : null, units: credited ? units : null, reason });
    if (status === "disputed") {
      const changed = next !== "approved" || hours !== (c.approved_hours != null ? Number(c.approved_hours) : null);
      await db.query("UPDATE disputes SET status = $2, decision_notes = $3, decided_by_user_id = $4, decided_at = NOW() WHERE contribution_id = $1 AND status = 'open'", [
        id,
        changed ? "overturned" : "upheld",
        reason ?? "Reviewed by another organization reviewer",
        user.id
      ]);
    }
    if (correcting || status === "disputed") supersededFor = await supersedeRecords(db, id);
    await db.query("COMMIT");

    const title = (await pool.query("SELECT title FROM service_requests WHERE id = $1", [c.request_id])).rows[0]?.title ?? "your volunteering";
    const verb = { approved: "approved", adjusted: "approved with a change", rejected: "not approved", revision_requested: "sent back for a change" }[next as "approved"] ?? next;
    notifyVolunteer = {
      volunteer: String(c.volunteer_user_id),
      title: `Your hours for “${title}” were ${verb}`,
      body: [credited && hours != null ? `${hours} h approved` : "", reason ? `Note: ${reason}` : ""].filter(Boolean).join(" · ")
    };
    result = { id, status: next, approved_hours: credited ? hours : null, approved_units: credited ? units : null };
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    db.release();
  }
  if (notifyVolunteer) {
    await notify(notifyVolunteer.volunteer, "hours", {
      title: notifyVolunteer.title,
      body: notifyVolunteer.body,
      href: "/volunteer/history#completed",
      email: { subject: notifyVolunteer.title, heading: notifyVolunteer.title, lines: [notifyVolunteer.body || "See your Impact page for details."], cta: { label: "See your impact", url: "/volunteer/history" } }
    });
  }
  for (const uid of new Set(supersededFor)) {
    await notify(uid, "hours", {
      title: "A shared service record changed",
      body: "Hours in a record you shared were corrected. The old link now says so; make a new one from your Impact page.",
      href: "/volunteer/records"
    });
  }
  return result!;
}

/** The volunteer fixes and resends hours that were sent back. */
export async function resubmit(volunteerId: string, id: string, input: { hours?: number | null; units?: number | null; startedAt?: Date | null; endedAt?: Date | null; description?: string | null }) {
  const cur = await pool.query("SELECT * FROM contributions WHERE id = $1 AND volunteer_user_id = $2", [id, volunteerId]);
  const c = cur.rows[0];
  if (!c) throw new ContributionError(404, "not_found", "Contribution not found");
  if (c.status !== "revision_requested") throw new ContributionError(409, "invalid_state", "Only hours that were sent back can be resubmitted");
  const start = input.startedAt ?? (c.started_at ? new Date(c.started_at) : null);
  const end = input.endedAt ?? (c.ended_at ? new Date(c.ended_at) : null);
  const hours = input.hours ?? (input.startedAt && input.endedAt ? hoursBetween(input.startedAt, input.endedAt, Number(c.break_minutes) || 0) : c.reported_hours != null ? Number(c.reported_hours) : null);
  const flagged = await overlaps(pool, volunteerId, start, end, id, true);
  await pool.query(
    `UPDATE contributions SET status = 'pending', reported_hours = $2, reported_units = COALESCE($3, reported_units), started_at = $4, ended_at = $5,
            description = COALESCE($6, description), overlap_flag = $7, updated_at = NOW() WHERE id = $1`,
    [id, hours, input.units ?? null, start?.toISOString() ?? null, end?.toISOString() ?? null, input.description ?? null, flagged]
  );
  await log(pool, id, volunteerId, "volunteer", "resubmitted", { hours, units: input.units ?? null, reason: input.description ?? null });
  await tellReviewers(id);
  return { id, status: "pending" as const };
}

/** The volunteer disputes a decision: another reviewer from the organization, or platform staff, looks again (CON-06, GOV-03). */
export async function dispute(volunteerId: string, id: string, reason: string) {
  const cur = await pool.query("SELECT * FROM contributions WHERE id = $1 AND volunteer_user_id = $2", [id, volunteerId]);
  const c = cur.rows[0];
  if (!c) throw new ContributionError(404, "not_found", "Contribution not found");
  if (!["approved", "adjusted", "rejected"].includes(c.status)) throw new ContributionError(409, "invalid_state", "Only a decision can be disputed");
  if (c.status === "approved") throw new ContributionError(409, "nothing_to_dispute", "These hours were approved as reported");
  await pool.query("UPDATE contributions SET status = 'disputed', updated_at = NOW() WHERE id = $1", [id]);
  await log(pool, id, volunteerId, "volunteer", "disputed", { reason });
  const d = await pool.query(
    `INSERT INTO disputes (application_id, request_id, kind, contribution_id, opened_by_user_id, against_user_id, reason)
     VALUES ($1, $2, 'hours', $3, $4, $5, $6) RETURNING id`,
    [c.application_id, c.request_id, id, volunteerId, c.decided_by_user_id, reason]
  );
  // Another reviewer who wasn't part of the decision sees it in their queue; if there's none, platform staff do.
  const others = (await reviewerIds(id)).filter((uid) => uid !== String(c.decided_by_user_id || ""));
  for (const uid of others) {
    await notify(uid, "hours", {
      title: "A volunteer disputed an hours decision",
      body: reason,
      href: c.org_slug ? "/org/hours?status=disputed" : "/requester/hours?status=disputed",
      email: { subject: "An hours decision was disputed", heading: "A second look is needed", lines: [`The volunteer says: ${reason}`, "You weren't part of the first decision, so you can review it."], cta: { label: "Review it", url: c.org_slug ? "/org/hours?status=disputed" : "/requester/hours?status=disputed" } }
    });
  }
  return { id, status: "disputed" as const, dispute_id: String(d.rows[0].id), second_reviewers: others.length };
}

/**
 * Platform staff resolve an hours dispute nobody else at the organization could take. They can let
 * the decision stand or mark the entry unverifiable; they never approve service they didn't see.
 */
export async function resolveDisputeAsStaff(contributionId: string, outcome: "upheld" | "overturned" | "dismissed", staffUserId: string, notes: string) {
  const c = (await pool.query("SELECT * FROM contributions WHERE id = $1", [contributionId])).rows[0];
  if (!c || c.status !== "disputed") return;
  if (outcome === "overturned") {
    await pool.query("UPDATE contributions SET status = 'unverified', approved_hours = NULL, approved_units = NULL, updated_at = NOW() WHERE id = $1", [contributionId]);
    await log(pool, contributionId, staffUserId, "platform_staff", "marked_unverified", { reason: notes });
  } else {
    const prev = await pool.query(
      "SELECT action FROM contribution_decisions WHERE contribution_id = $1 AND action IN ('approved', 'adjusted', 'rejected', 'corrected') ORDER BY created_at DESC LIMIT 1",
      [contributionId]
    );
    const back = c.approved_hours != null || c.approved_units != null ? (prev.rows[0]?.action === "approved" ? "approved" : "adjusted") : "rejected";
    await pool.query("UPDATE contributions SET status = $2, updated_at = NOW() WHERE id = $1", [contributionId, back]);
    await log(pool, contributionId, staffUserId, "platform_staff", "dispute_upheld", { reason: notes });
  }
  await supersedeRecords(pool, contributionId);
}

/** A reviewer says they can't be impartial about this volunteer (family, friend, themselves). */
export async function declareConflict(user: PolicyUser, id: string, relationship: string) {
  const c = (await pool.query("SELECT * FROM contributions WHERE id = $1", [id])).rows[0];
  if (!c || !c.org_slug) throw new ContributionError(404, "not_found", "Contribution not found");
  const m = orgMembership(user, String(c.org_slug));
  if (!m || (m.role !== "admin" && m.role !== "manager")) throw new ContributionError(404, "not_found", "Contribution not found");
  await pool.query(
    "INSERT INTO staff_conflicts (org_slug, staff_user_id, volunteer_user_id, relationship) VALUES ($1, $2, $3, $4) ON CONFLICT (org_slug, staff_user_id, volunteer_user_id) DO UPDATE SET relationship = EXCLUDED.relationship",
    [c.org_slug, user.id, c.volunteer_user_id, relationship]
  );
  await log(pool, id, user.id, m.role === "admin" ? "org_admin" : "org_manager", "conflict_declared", { reason: relationship });
  const others = await reviewerIds(id);
  return { id, other_reviewers: others.length };
}

/** A closed attendance log (check-in and check-out) becomes a pending contribution. Idempotent per log. */
export async function contributionFromAttendance(logId: string, method: "staff_check_in" | "qr_check_in" | "manual_attendance", actorUserId: string | null) {
  const r = await pool.query("SELECT * FROM org_attendance_logs WHERE id = $1", [logId]);
  const l = r.rows[0];
  if (!l || !l.check_out_at) return null;
  const start = new Date(l.check_in_at);
  const end = new Date(l.check_out_at);
  return createContribution({
    volunteerUserId: String(l.volunteer_user_id),
    requestId: String(l.request_id),
    applicationId: l.request_application_id ? String(l.request_application_id) : null,
    source: "check_in",
    method,
    attendanceLogId: logId,
    startedAt: start,
    endedAt: end,
    hours: l.hours != null ? Number(l.hours) : hoursBetween(start, end),
    description: l.notes ?? null,
    actorUserId,
    actorRole: method === "qr_check_in" ? "volunteer" : "org_staff"
  });
}
