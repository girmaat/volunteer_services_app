/**
 * Requests, owner side (Phase 4.2/4.3): one API for individual requesters and organizations.
 * Drafts are saved one wizard step at a time; going live always goes through transitionRequest.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { can, orgMembership, type PolicyUser } from "../../lib/policy";
import { requireAuthedUser } from "../../middleware/auth";
import { enqueue } from "../../jobs/queue";
import { ownerActions, staffingCounts, syncStaffing, transitionRequest, TransitionError, publishProblems } from "./lifecycle";
import { buildSet, crossFieldProblems, getCategory, listCategories, meetsTier, posterTier, RequestFields } from "./model";

export const OWNER_COLUMNS = `r.id, r.title, r.description, r.status, r.review_status, r.review_notes, r.category, r.required_skills, r.nice_to_have_skills,
  r.volunteers_needed, r.urgency, r.schedule_type, r.starts_at, r.ends_at, r.recurrence_rule, r.timezone, r.duration_minutes, r.apply_by,
  r.mode, r.public_area, r.exact_address, r.accessibility_notes, r.min_age, r.requires_background_check, r.requires_training,
  r.requires_waiver, r.requires_car, r.equipment_notes, r.is_sensitive, r.requester_user_id, r.requester_org_slug, r.published_at,
  r.filled_at, r.completed_at, r.canceled_at, r.cancel_reason, r.removed_at, r.removed_reason, r.created_at, r.updated_at`;

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
        `SELECT r.id, r.title, r.status, r.review_status, r.category, r.mode, r.public_area, r.starts_at, r.volunteers_needed, r.updated_at, r.published_at,
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
        const loc = await pool.query("SELECT mode, COALESCE(exact_address, public_area) AS q FROM service_requests WHERE id = $1", [row.id]);
        if (loc.rows[0]?.mode !== "remote" && loc.rows[0]?.q) await enqueue("geocode.request", { requestId: row.id, locationText: String(loc.rows[0].q) });
      }
      if (live && f.volunteersNeeded !== undefined) await syncStaffing(row.id, { userId: user.id, kind: "user" });
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
