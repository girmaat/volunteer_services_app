/**
 * Hours approval endpoints: reviewers (org admins and managers, or the individual who posted the
 * request) and volunteers (their own contributions). Logic lives in ./service.
 */
import type { Express, Response } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { orgMembership, type PolicyUser } from "../../lib/policy";
import { requireAuthedUser, requireVolunteerUser } from "../../middleware/auth";
import { checkReviewer, ContributionError, createContribution, decide, declareConflict, dispute, METHOD_LABEL, resubmit, type Method } from "./service";

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });

function fail(res: Response, e: unknown) {
  if (e instanceof ContributionError) return res.status(e.status).json({ error: { code: e.code, message: e.message }, message: e.message });
  throw e;
}

const LIST_COLUMNS = `c.id, c.status, c.source, c.verification_method, c.started_at, c.ended_at, c.break_minutes, c.timezone,
  c.reported_hours::float AS reported_hours, c.reported_units::float AS reported_units, c.unit,
  c.approved_hours::float AS approved_hours, c.approved_units::float AS approved_units,
  c.description, c.overlap_flag, c.created_at, c.decided_at, c.decided_by_user_id, c.decided_by_role, c.org_slug,
  c.request_id, c.application_id, c.volunteer_user_id, r.title AS request_title, r.target_unit,
  COALESCE(NULLIF(vp.display_name, ''), split_part(COALESCE(vp.full_name, ''), ' ', 1), 'Volunteer') AS volunteer_name,
  (SELECT d.reason FROM contribution_decisions d WHERE d.contribution_id = c.id AND d.action IN ('adjusted', 'rejected', 'revision_requested', 'corrected', 'disputed', 'marked_unverified', 'dispute_upheld')
    ORDER BY d.created_at DESC LIMIT 1) AS last_reason`;

/** Things a reviewer should look at before approving in bulk (CON-05). */
function exceptions(c: Record<string, any>) {
  const out: string[] = [];
  if (c.overlap_flag) out.push("Overlaps other hours for this volunteer");
  if (c.reported_hours != null && Number(c.reported_hours) > 12) out.push("More than 12 hours in one entry");
  if (c.source === "volunteer_report") out.push("Reported by the volunteer, not from attendance");
  if (c.reported_hours == null && c.reported_units == null) out.push("No hours reported");
  return out;
}

export function registerContributionRoutes(app: Express) {
  // ---- Reviewers ------------------------------------------------------------------------------
  app.get(
    "/v1/contributions/review",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const q = z
        .object({ as: z.enum(["org", "requester"]).default("org"), status: z.enum(["waiting", "disputed", "decided"]).default("waiting"), requestId: uuid.optional(),
                   limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).max(100_000).default(0) })
        .safeParse(req.query);
      if (!q.success) return res.status(400).json({ message: "Invalid query" });
      const org = q.data.as === "org" ? orgMembership(user) : null;
      if (q.data.as === "org" && (!org || (org.role !== "admin" && org.role !== "manager"))) return res.status(403).json({ message: "Only organization admins and managers review hours" });
      const statuses = q.data.status === "waiting" ? ["pending"] : q.data.status === "disputed" ? ["disputed"] : ["approved", "adjusted", "rejected", "revision_requested", "unverified"];
      const r = await pool.query(
        `SELECT ${LIST_COLUMNS}, COUNT(*) OVER () AS total_count
           FROM contributions c
           JOIN service_requests r ON r.id = c.request_id
           LEFT JOIN user_profiles vp ON vp.user_id = c.volunteer_user_id
          WHERE ${org ? "c.org_slug = $1" : "c.org_slug IS NULL AND r.requester_user_id = $1"}
            AND c.status = ANY($2::text[]) AND ($3::uuid IS NULL OR c.request_id = $3)
          ORDER BY ${q.data.status === "decided" ? "c.decided_at DESC" : "c.created_at"}, c.id LIMIT $4 OFFSET $5`,
        [org ? org.slug : user.id, statuses, q.data.requestId ?? null, q.data.limit, q.data.offset]
      );
      const conflicts = org
        ? new Set((await pool.query("SELECT volunteer_user_id FROM staff_conflicts WHERE org_slug = $1 AND staff_user_id = $2", [org.slug, user.id])).rows.map((x) => String(x.volunteer_user_id)))
        : new Set<string>();
      const orgOk = org
        ? Boolean((await pool.query("SELECT 1 FROM organizations WHERE slug = $1 AND verification_status = 'approved' AND suspended_at IS NULL", [org.slug])).rowCount)
        : true;
      const total = r.rows.length ? Number(r.rows[0].total_count) : q.data.offset ? Number((await pool.query(
        `SELECT COUNT(*)::int AS n FROM contributions c JOIN service_requests r ON r.id = c.request_id
          WHERE ${org ? "c.org_slug = $1" : "c.org_slug IS NULL AND r.requester_user_id = $1"} AND c.status = ANY($2::text[]) AND ($3::uuid IS NULL OR c.request_id = $3)`,
        [org ? org.slug : user.id, statuses, q.data.requestId ?? null]
      )).rows[0].n) : 0;
      const items = r.rows.map(({ total_count: _t, ...c }) => {
        let why: string | null = null;
        if (String(c.volunteer_user_id) === user.id) why = "Your own hours: another reviewer approves these";
        else if (conflicts.has(String(c.volunteer_user_id))) why = "You declared a conflict with this volunteer";
        else if (c.status === "disputed" && String(c.decided_by_user_id || "") === user.id) why = "Disputed after your decision: another reviewer decides";
        else if (!orgOk) why = "Your organization must be verified to approve hours";
        return {
          ...c,
          method_label: METHOD_LABEL[c.verification_method as Method],
          exceptions: exceptions(c),
          can_decide: !why && ["pending", "disputed", "approved", "adjusted", "rejected"].includes(c.status),
          why_not: why
        };
      });
      const counts = await pool.query(
        `SELECT c.status, COUNT(*)::int AS n FROM contributions c JOIN service_requests r ON r.id = c.request_id
          WHERE ${org ? "c.org_slug = $1" : "c.org_slug IS NULL AND r.requester_user_id = $1"} AND c.status IN ('pending', 'disputed') GROUP BY c.status`,
        [org ? org.slug : user.id]
      );
      const n = Object.fromEntries(counts.rows.map((x) => [x.status, x.n]));
      return res.json({
        items,
        page: { total, offset: q.data.offset, limit: q.data.limit, next_offset: q.data.offset + items.length < total ? q.data.offset + items.length : null },
        counts: { waiting: n.pending ?? 0, disputed: n.disputed ?? 0 },
        org_verified: orgOk
      });
    })
  );

  app.get(
    "/v1/contributions/:id",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const r = await pool.query(
        `SELECT ${LIST_COLUMNS} FROM contributions c LEFT JOIN service_requests r ON r.id = c.request_id LEFT JOIN user_profiles vp ON vp.user_id = c.volunteer_user_id WHERE c.id = $1`,
        [id.data]
      );
      const c = r.rows[0];
      if (!c) return res.status(404).json({ message: "Contribution not found" });
      const mine = String(c.volunteer_user_id) === user.id;
      if (!mine) {
        const who = await checkReviewer(user, c);
        if (!who.ok && who.code === "not_found") return res.status(404).json({ message: "Contribution not found" });
      }
      const d = await pool.query(
        `SELECT d.action, d.actor_role, d.hours::float AS hours, d.units::float AS units, d.reason, d.created_at
           FROM contribution_decisions d WHERE d.contribution_id = $1 ORDER BY d.created_at`,
        [id.data]
      );
      return res.json({ ...c, method_label: METHOD_LABEL[c.verification_method as Method], exceptions: exceptions(c), history: d.rows });
    })
  );

  app.post(
    "/v1/contributions/:id/decide",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      const body = z
        .object({
          action: z.enum(["approve", "adjust", "reject", "request_revision"]),
          hours: z.coerce.number().min(0).max(24).nullable().optional(),
          units: z.coerce.number().min(0).max(100000).nullable().optional(),
          reason: z.string().trim().max(1000).optional()
        })
        .safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Invalid request", errors: body.success ? undefined : body.error.flatten() });
      try {
        return res.json(await decide(user, id.data, body.data));
      } catch (e) {
        return fail(res, e);
      }
    })
  );

  // Approves the selected entries that have nothing to look at; the rest come back as skipped (CON-05).
  app.post(
    "/v1/contributions/bulk-approve",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const body = z.object({ ids: z.array(uuid).min(1).max(100) }).safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ message: "Pick the hours to approve" });
      const approved: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      for (const cid of body.data.ids) {
        const c = (await pool.query("SELECT * FROM contributions WHERE id = $1", [cid])).rows[0];
        if (!c) {
          skipped.push({ id: cid, reason: "Not found" });
          continue;
        }
        const ex = exceptions(c);
        if (ex.length) {
          skipped.push({ id: cid, reason: ex.join("; ") });
          continue;
        }
        try {
          await decide(user, cid, { action: "approve" });
          approved.push(cid);
        } catch (e) {
          if (!(e instanceof ContributionError)) throw e;
          skipped.push({ id: cid, reason: e.message });
        }
      }
      return res.json({ approved, skipped });
    })
  );

  app.post(
    "/v1/contributions/:id/conflict",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ relationship: z.string().trim().min(2).max(200) }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Say what the relationship is (for example: my son)" });
      try {
        return res.json(await declareConflict(user, id.data, body.data.relationship));
      } catch (e) {
        return fail(res, e);
      }
    })
  );

  // ---- Volunteers ------------------------------------------------------------------------------
  app.get(
    "/v1/volunteer/contributions",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const r = await pool.query(
        `SELECT ${LIST_COLUMNS}, o.name AS organization_name
           FROM contributions c LEFT JOIN service_requests r ON r.id = c.request_id LEFT JOIN user_profiles vp ON vp.user_id = c.volunteer_user_id
           LEFT JOIN organizations o ON o.slug = c.org_slug
          WHERE c.volunteer_user_id = $1 ORDER BY COALESCE(c.started_at, c.created_at) DESC LIMIT 500`,
        [user.id]
      );
      return res.json({ contributions: r.rows.map((c) => ({ ...c, method_label: METHOD_LABEL[c.verification_method as Method] })) });
    })
  );

  app.post(
    "/v1/volunteer/contributions",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const body = z
        .object({
          applicationId: uuid.optional(),
          startedAt: iso.optional(),
          endedAt: iso.optional(),
          breakMinutes: z.coerce.number().int().min(0).max(720).optional(),
          hours: z.coerce.number().min(0.25).max(24).optional(),
          units: z.coerce.number().min(0).max(100000).optional(),
          description: z.string().trim().min(1).max(1000)
        })
        .safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ message: "Describe what you did and give the hours or the start and end time", errors: body.error.flatten() });
      const b = body.data;
      const start = b.startedAt ? new Date(b.startedAt) : null;
      const end = b.endedAt ? new Date(b.endedAt) : null;
      if ((start && !end) || (!start && end)) return res.status(400).json({ message: "Give both a start and an end time" });
      if (start && end && (end <= start || end.getTime() - start.getTime() > 24 * 3_600_000)) return res.status(400).json({ message: "The end must be after the start, within 24 hours" });
      if (!start && b.hours == null && b.units == null) return res.status(400).json({ message: "Give the hours or the start and end time" });
      if (end && end > new Date()) return res.status(400).json({ message: "You can only report time that already happened" });
      let requestId: string | null = null;
      if (b.applicationId) {
        const a = await pool.query("SELECT request_id, status FROM request_applications WHERE id = $1 AND volunteer_user_id = $2", [b.applicationId, user.id]);
        if (!a.rowCount) return res.status(404).json({ message: "Application not found" });
        if (!["accepted", "confirmed", "completed"].includes(String(a.rows[0].status))) return res.status(409).json({ message: "You can report hours once you've been accepted" });
        requestId = String(a.rows[0].request_id);
      }
      const id = await createContribution({
        volunteerUserId: user.id,
        requestId,
        applicationId: b.applicationId ?? null,
        source: requestId ? "volunteer_report" : "outside",
        method: requestId ? "volunteer_report" : "self_reported",
        startedAt: start,
        endedAt: end,
        breakMinutes: b.breakMinutes ?? 0,
        hours: start ? null : (b.hours ?? null),
        units: b.units ?? null,
        description: b.description,
        actorUserId: user.id,
        actorRole: "volunteer"
      });
      const row = (await pool.query("SELECT id, status, reported_hours::float AS reported_hours, overlap_flag FROM contributions WHERE id = $1", [id])).rows[0];
      return res.status(201).json(row);
    })
  );

  app.post(
    "/v1/volunteer/contributions/:id/resubmit",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      const body = z
        .object({ hours: z.coerce.number().min(0.25).max(24).optional(), units: z.coerce.number().min(0).max(100000).optional(), startedAt: iso.optional(), endedAt: iso.optional(), description: z.string().trim().max(1000).optional() })
        .safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Invalid request" });
      const b = body.data;
      try {
        return res.json(await resubmit(user.id, id.data, { hours: b.hours ?? null, units: b.units ?? null, startedAt: b.startedAt ? new Date(b.startedAt) : null, endedAt: b.endedAt ? new Date(b.endedAt) : null, description: b.description ?? null }));
      } catch (e) {
        return fail(res, e);
      }
    })
  );

  app.post(
    "/v1/volunteer/contributions/:id/dispute",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ reason: z.string().trim().min(10).max(1000) }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Explain what's wrong in a sentence or two" });
      try {
        return res.json(await dispute(user.id, id.data, body.data.reason));
      } catch (e) {
        return fail(res, e);
      }
    })
  );
}
