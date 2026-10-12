/**
 * Requests, owner side (Phase 4.2/4.3): one API for individual requesters and organizations.
 * Drafts are saved one wizard step at a time; going live always goes through transitionRequest.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { wrap } from "../../lib/http";
import { can, orgMembership, type PolicyUser } from "../../lib/policy";
import { requireAuthedUser } from "../../middleware/auth";
import { enqueue } from "../../jobs/queue";
import { ownerActions, staffingCounts, syncStaffing, transitionRequest, TransitionError, publishProblems } from "./lifecycle";
import { buildSet, crossFieldProblems, getCategory, listCategories, meetsTier, posterTier, RequestFields } from "./model";
import { needsOwnerApproval, orgStanding, standingMessage, submitForOwnerApproval } from "./governance";
import { notify } from "../notifications/service";
import { calendarChanged } from "../calendar/updates";
import { requestProgress } from "./progress";

export const OWNER_COLUMNS = `r.id, r.title, r.description, r.status, r.review_status, r.review_notes, r.category, r.required_skills, r.nice_to_have_skills,
  r.volunteers_needed, r.urgency, r.schedule_type, r.starts_at, r.ends_at, r.recurrence_rule, r.timezone, r.duration_minutes, r.apply_by,
  r.mode, r.public_area, r.exact_address, r.accessibility_notes, r.min_age, r.requires_background_check, r.requires_training,
  r.requires_waiver, r.requires_car, r.equipment_notes, r.is_sensitive, r.requester_user_id, r.requester_org_slug, r.published_at,
  r.filled_at, r.completed_at, r.canceled_at, r.cancel_reason, r.removed_at, r.removed_reason, r.created_at, r.updated_at,
  r.target_value::float AS target_value, r.target_unit, r.min_contribution::float AS min_contribution, r.allow_overfill, r.requires_guardian_consent,
  r.owner_approval, r.owner_approval_notes, r.owner_approved_at, r.submitted_by_user_id, r.checkin_token`;

type Owned = { row: Record<string, any>; user: PolicyUser };

/** Loads a request the signed-in user may manage (its creator, or a member of the posting organization). */
export async function loadOwned(req: Request, res: Response, id: string, opts: { manage?: boolean } = {}): Promise<Owned | null> {
  const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
  if (!user) return null;
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ message: "Invalid request id" });
    return null;
  }
  const r = await pool.query(`SELECT ${OWNER_COLUMNS} FROM service_requests r WHERE r.id = $1`, [id]);
  const row = r.rows[0];
  const mine =
    row &&
    (row.requester_org_slug
      ? opts.manage
        ? can(user, "org:manage", { orgSlug: row.requester_org_slug })
        : Boolean(orgMembership(user, row.requester_org_slug))
      : String(row.requester_user_id) === user.id && can(user, "requester:act"));
  if (!row || !mine) {
    res.status(404).json({ message: "Request not found" });
    return null;
  }
  return { row, user };
}

function sendTransitionError(res: Response, e: unknown) {
  if (e instanceof TransitionError) return res.status(e.status).json({ error: { code: e.code, message: e.message }, message: e.message });
  throw e;
}

async function ownerView(row: Record<string, any>) {
  const counts = await staffingCounts(pool, row.id);
  const events = await pool.query(
    "SELECT event, from_status, to_status, actor_kind, reason, created_at FROM request_status_events WHERE request_id = $1 ORDER BY created_at",
    [row.id]
  );
  return {
    ...row,
    staffing: counts,
    actions: ownerActions(row.status, row.review_status),
    progress: await requestProgress(row.id),
    checkin_url: row.checkin_token ? `${env.WEB_BASE_URL.replace(/\/$/, "")}/check-in/${row.checkin_token}` : null,
    publish_problems: [...publishProblems(row), ...crossFieldProblems(row)],
    events: events.rows
  };
}

export function registerRequestRoutes(app: Express) {
  app.get(
    "/v1/public/categories",
    wrap(async (_req, res) => {
      res.set("Cache-Control", "public, max-age=300");
      return res.json({ categories: await listCategories() });
    })
  );

  // Create a draft as yourself (requester) or for an organization you belong to.
  app.post(
    "/v1/requests",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const head = z.object({ as: z.enum(["requester", "org"]).default("requester"), orgSlug: z.string().max(80).optional() }).safeParse({ as: req.body?.as, orgSlug: req.body?.orgSlug });
      if (!head.success) return res.status(400).json({ message: "Invalid payload", errors: head.error.flatten() });
      const { as: who } = head.data;
      let orgSlug: string | null = null;
      if (who === "org") {
        const m = orgMembership(user, head.data.orgSlug ?? null);
        if (!m || !can(user, "org:manage", { orgSlug: m.slug })) return res.status(403).json({ message: "Only organization admins and managers can post requests" });
        orgSlug = m.slug;
      } else if (!can(user, "requester:act")) {
        return res.status(403).json({ message: "Add the requester role to post requests" });
      }
      const fieldsParsed = RequestFields.safeParse(omit(req.body ?? {}, ["as", "orgSlug"]));
      if (!fieldsParsed.success) return res.status(400).json({ message: "Invalid payload", errors: fieldsParsed.error.flatten() });

      if (fieldsParsed.data.category && !(await getCategory(fieldsParsed.data.category))) return res.status(400).json({ message: "Unknown category" });
      if (fieldsParsed.data.targetValue != null && !fieldsParsed.data.targetUnit) return res.status(400).json({ message: "Say what the goal is counted in (hours, meals, items…)" });
      if (fieldsParsed.data.requiresGuardianConsent && who !== "org") return res.status(400).json({ message: "Guardian consent applies to organization requests (individual requests are for adults)" });

      const ins = await pool.query(
        `INSERT INTO service_requests (requester_user_id, requester_org_slug, status, title, description, mode, timezone, location_text)
         VALUES ($1, $2, 'draft', '', '', 'remote', 'America/New_York', '') RETURNING id`,
        [user.id, orgSlug]
      );
      const id = String(ins.rows[0].id);
      await saveFields(id, fieldsParsed.data);
      await pool.query(
        "INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_user_id, actor_kind) VALUES ($1, 'create', NULL, 'draft', $2, 'user')",
        [id, user.id]
      );
      return res.status(201).json({ id, status: "draft" });
    })
  );

  app.get(
    "/v1/requests/mine",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const q = z
        .object({ as: z.enum(["requester", "org"]).default("requester"), status: z.string().max(20).optional() })
        .safeParse(req.query);
      if (!q.success) return res.status(400).json({ message: "Invalid query" });
      const org = q.data.as === "org" ? orgMembership(user) : null;
      if (q.data.as === "org" && !org) return res.status(403).json({ message: "Forbidden" });
      if (q.data.as === "requester" && !can(user, "requester:act")) return res.status(403).json({ message: "Forbidden" });
      const r = await pool.query(
        `SELECT r.id, r.title, r.status, r.review_status, r.owner_approval, r.owner_approval_notes, r.category, r.mode, r.public_area, r.starts_at, r.volunteers_needed, r.updated_at, r.published_at,
                COUNT(a.id) FILTER (WHERE a.status IN ('accepted','confirmed','completed'))::int AS accepted,
                COUNT(a.id) FILTER (WHERE a.status = 'pending')::int AS pending
           FROM service_requests r LEFT JOIN request_applications a ON a.request_id = r.id
          WHERE ${org ? "r.requester_org_slug = $1" : "r.requester_user_id = $1 AND r.requester_org_slug IS NULL"}
            AND ($2::text IS NULL OR r.status = $2)
          GROUP BY r.id ORDER BY r.updated_at DESC LIMIT 200`,
        [org ? org.slug : user.id, q.data.status ?? null]
      );
      return res.json({ requests: r.rows });
    })
  );

  app.get(
    "/v1/requests/:id",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id);
      if (!owned) return;
      return res.json(await ownerView(owned.row));
    })
  );

  app.patch(
    "/v1/requests/:id",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id, { manage: true });
      if (!owned) return;
      const { row, user } = owned;
      if (["completed", "canceled"].includes(row.status)) return res.status(409).json({ message: `This request is ${row.status} and can't be edited` });
      const parsed = RequestFields.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
      const f = parsed.data;
      const live = row.status !== "draft";
      const nextValue = f.targetValue !== undefined ? f.targetValue : row.target_value;
      const nextUnit = f.targetUnit !== undefined ? f.targetUnit : row.target_unit;
      if (nextValue != null && !nextUnit) return res.status(400).json({ message: "Say what the goal is counted in (hours, meals, items…)" });
      if (f.requiresGuardianConsent && !row.requester_org_slug) return res.status(400).json({ message: "Guardian consent applies to organization requests" });
      if (f.category && f.category !== row.category) {
        const cat = await getCategory(f.category);
        if (!cat) return res.status(400).json({ message: "Unknown category" });
        if (live && cat.is_sensitive !== Boolean(row.is_sensitive)) {
          return res.status(409).json({ message: "Moving a live request into or out of a sensitive category needs a new request" });
        }
      }
      if (live && f.volunteersNeeded !== undefined) {
        const c = await staffingCounts(pool, row.id);
        if (f.volunteersNeeded < c.accepted) return res.status(409).json({ message: `You already accepted ${c.accepted}; cancel someone first or keep at least ${c.accepted} spots` });
      }
      const merged = {
        ...row,
        starts_at: f.startsAt !== undefined ? f.startsAt : row.starts_at,
        ends_at: f.endsAt !== undefined ? f.endsAt : row.ends_at,
        apply_by: f.applyBy !== undefined ? f.applyBy : row.apply_by
      };
      if (merged.starts_at && merged.ends_at && new Date(merged.ends_at) < new Date(merged.starts_at)) {
        return res.status(400).json({ error: { code: "invalid_window", message: "The end time is before the start time" }, message: "The end time is before the start time" });
      }
      await saveFields(row.id, f);
      // Editing a request that's waiting for review takes it out of the queue until it's submitted again.
      if (row.review_status === "pending_review") await pool.query("UPDATE service_requests SET review_status = 'approved' WHERE id = $1", [row.id]);
      if (live && (f.mode || f.publicArea || f.exactAddress)) {
        // Geocode the public area only: distances must not reveal the exact address.
        const loc = await pool.query("SELECT mode, public_area AS q FROM service_requests WHERE id = $1", [row.id]);
        if (loc.rows[0]?.mode !== "remote" && loc.rows[0]?.q) await enqueue("geocode.request", { requestId: row.id, locationText: String(loc.rows[0].q) });
      }
      if (live && f.volunteersNeeded !== undefined) await syncStaffing(row.id, { userId: user.id, kind: "user" });
      // A one-time shift that moved: move everyone's commitment and send updated invites (CAL-02, REQ-08).
      if (live && row.schedule_type === "one_time" && (f.startsAt !== undefined || f.endsAt !== undefined || f.durationMinutes !== undefined)) {
        const now = (await pool.query("SELECT starts_at, ends_at, duration_minutes FROM service_requests WHERE id = $1", [row.id])).rows[0];
        if (now?.starts_at && (String(now.starts_at) !== String(row.starts_at) || String(now.ends_at) !== String(row.ends_at) || now.duration_minutes !== row.duration_minutes)) {
          const end = now.ends_at ?? new Date(new Date(now.starts_at).getTime() + (Number(now.duration_minutes) || 60) * 60_000);
          const moved = await pool.query(
            "UPDATE request_commitments SET start_at = $2, end_at = $3, volunteer_confirmed_at = NULL, updated_at = NOW() WHERE request_id = $1 AND status IN ('scheduled', 'confirmed') RETURNING id",
            [row.id, now.starts_at, end]
          );
          await calendarChanged(moved.rows.map((r) => String(r.id)), "update");
        }
      }
      const fresh = await pool.query(`SELECT ${OWNER_COLUMNS} FROM service_requests r WHERE r.id = $1`, [row.id]);
      return res.json(await ownerView(fresh.rows[0]));
    })
  );

  app.post(
    "/v1/requests/:id/transition",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id, { manage: true });
      if (!owned) return;
      const { row, user } = owned;
      const parsed = z
        .object({ event: z.enum(["publish", "pause", "resume", "complete", "cancel"]), reason: z.string().trim().max(500).optional() })
        .safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
      const { event, reason } = parsed.data;

      if (event === "publish") {
        const problems = [...publishProblems(row), ...crossFieldProblems(row)];
        if (problems.length) return res.status(422).json({ error: { code: "incomplete", message: problems.join("; ") }, message: problems.join("; "), problems });
        const cat = await getCategory(row.category);
        if (!cat || !cat.enabled) return res.status(422).json({ message: "This category isn't available right now" });
        if (row.requester_org_slug) {
          // Verified organizations only (ORG-05); then the owner's publication policy (GOV-01).
          const standing = await orgStanding(String(row.requester_org_slug));
          if (!standing || !standing.verified) {
            const message = standing ? standingMessage(standing) : "Organization not found";
            return res.status(403).json({ error: { code: "org_not_verified", message }, message });
          }
          if (await needsOwnerApproval(user, row, standing.policy)) {
            if (row.owner_approval === "pending") return res.status(409).json({ error: { code: "awaiting_owner", message: "This request is already waiting for an owner's approval" }, message: "This request is already waiting for an owner's approval" });
            await submitForOwnerApproval(user, row);
            return res.status(202).json({ id: row.id, from: row.status, to: row.status, review_status: row.review_status, owner_approval: "pending", event, changed: true });
          }
          if (orgMembership(user, String(row.requester_org_slug))?.role === "admin") {
            await pool.query("UPDATE service_requests SET owner_approval = 'approved', owner_approved_by_user_id = $2, owner_approved_at = NOW(), owner_approval_notes = NULL WHERE id = $1", [row.id, user.id]);
          }
        }
        const tier = await posterTier(user, row.requester_org_slug);
        if (!meetsTier(tier, cat.min_post_tier)) {
          return res.status(403).json({
            error: { code: "verification_required", message: `Posting in “${cat.label}” needs a verified account` },
            message: `Posting in “${cat.label}” needs a verified account. Submit verification in Settings first.`
          });
        }
      }
      try {
        const result = await transitionRequest(row.id, event, { userId: user.id, kind: "user" }, { reason: reason ?? null });
        return res.json(result);
      } catch (e) {
        return sendTransitionError(res, e);
      }
    })
  );

  // An organization owner approves a coordinator's request (then it publishes) or sends it back with notes.
  app.post(
    "/v1/requests/:id/owner-approval",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id, { manage: true });
      if (!owned) return;
      const { row, user } = owned;
      if (!row.requester_org_slug || orgMembership(user, String(row.requester_org_slug))?.role !== "admin") {
        return res.status(403).json({ message: "Only an organization owner (admin) can approve requests" });
      }
      const body = z.object({ decision: z.enum(["approve", "reject"]), notes: z.string().trim().max(1000).optional() }).safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ message: "Approve or send back" });
      if (row.owner_approval !== "pending") return res.status(409).json({ message: "This request isn't waiting for approval" });
      if (row.submitted_by_user_id && String(row.submitted_by_user_id) === user.id) return res.status(403).json({ message: "Another owner has to approve a request you submitted" });
      const notes = body.data.notes || null;
      if (body.data.decision === "reject" && !notes) return res.status(422).json({ message: "Say what needs to change; the coordinator sees your note" });
      await pool.query(
        `UPDATE service_requests SET owner_approval = $2, owner_approval_notes = $3, owner_approved_by_user_id = $4, owner_approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id, body.data.decision === "approve" ? "approved" : "rejected", notes, user.id]
      );
      await pool.query(
        "INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_user_id, actor_kind, reason) VALUES ($1, $2, $3, $3, $4, 'user', $5)",
        [row.id, body.data.decision === "approve" ? "owner_approved" : "owner_rejected", row.status, user.id, notes]
      );
      if (row.submitted_by_user_id) {
        await notify(String(row.submitted_by_user_id), "request_updates", {
          title: body.data.decision === "approve" ? `“${row.title}” was approved` : `“${row.title}” needs changes before it goes public`,
          body: notes ?? "",
          href: `/org/requests/${row.id}`
        });
      }
      if (body.data.decision === "reject") return res.json({ id: row.id, owner_approval: "rejected", status: row.status });
      const standing = await orgStanding(String(row.requester_org_slug));
      if (!standing?.verified) return res.status(403).json({ message: standing ? standingMessage(standing) : "Organization not found" });
      try {
        const result = await transitionRequest(row.id, "publish", { userId: user.id, kind: "user" });
        return res.json({ ...result, owner_approval: "approved" });
      } catch (e) {
        return sendTransitionError(res, e);
      }
    })
  );

  app.delete(
    "/v1/requests/:id",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id, { manage: true });
      if (!owned) return;
      if (owned.row.status !== "draft" || owned.row.published_at) return res.status(409).json({ message: "Only unpublished drafts can be deleted; cancel a live request instead" });
      await pool.query("DELETE FROM service_requests WHERE id = $1", [owned.row.id]);
      return res.status(204).end();
    })
  );
}

/** Writes wizard fields and keeps the derived sensitivity flag in step with the category. */
export async function saveFields(id: string, f: import("./model").RequestFieldsInput) {
  const { sets, params } = buildSet(f, 2);
  if (!sets.length) return;
  await pool.query(`UPDATE service_requests SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, [id, ...params]);
  if (f.category) {
    await pool.query("UPDATE service_requests r SET is_sensitive = c.is_sensitive FROM request_categories c WHERE c.slug = r.category AND r.id = $1", [id]);
  }
}

function omit(obj: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!keys.includes(k)) out[k] = v;
  return out;
}
