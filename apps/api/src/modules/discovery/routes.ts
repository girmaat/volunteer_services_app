import type { Express, Request } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { can, type PolicyUser } from "../../lib/policy";
import { optionalAuthedUser } from "../../middleware/auth";
import { applyEligibility } from "../requests/eligibility";
import { discover, discoverOne, loadViewer, present, type Viewer } from "./query";

const csv = z
  .string()
  .max(500)
  .transform((s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 20));

const Query = z.object({
  q: z.string().trim().max(100).optional(),
  category: csv.optional(),
  skills: csv.optional(),
  mode: z.enum(["in-person", "remote", "hybrid"]).optional(),
  radius: z.coerce.number().min(1).max(200).optional(),
  starts_after: z.string().datetime({ offset: true }).optional(),
  starts_before: z.string().datetime({ offset: true }).optional(),
  verified_org: z.enum(["true", "false"]).optional(),
  urgency: z.enum(["low", "normal", "high"]).optional(),
  tab: z.enum(["recommended", "nearby", "remote", "all"]).optional(),
  org: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(40).optional()
});

const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
const decodeCursor = (c?: string) => {
  if (!c) return 0;
  try {
    const o = Number(JSON.parse(Buffer.from(c, "base64url").toString("utf8")).o);
    return Number.isFinite(o) && o >= 0 && o <= 10_000 ? o : 0;
  } catch {
    return 0;
  }
};

/** Volunteers get personalised matching; everyone else gets the public view. */
async function viewerFor(req: Request): Promise<{ user: PolicyUser | null; viewer: Viewer }> {
  const user = (await optionalAuthedUser(req)) as PolicyUser | null;
  const usable = user && !(user.banned_until && new Date(String(user.banned_until)) > new Date()) ? user : null;
  const viewer = await loadViewer(usable && can(usable, "volunteer:act") ? usable : null);
  // Non-volunteer signed-in users still shouldn't see their own requests or blocked people.
  if (usable && !viewer.id) viewer.id = usable.id;
  return { user: usable, viewer };
}

export function registerDiscoveryRoutes(app: Express) {
  app.get(
    "/v1/discovery/opportunities",
    wrap(async (req, res) => {
      const parsed = Query.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
      const qy = parsed.data;
      const { user, viewer } = await viewerFor(req);
      if ((qy.tab === "recommended" || qy.tab === "nearby") && !(user && can(user, "volunteer:act"))) {
        return res.status(401).json({ message: "Sign in as a volunteer for personalised results" });
      }
      const offset = decodeCursor(qy.cursor);
      const result = await discover(viewer, {
        q: qy.q || undefined,
        categories: qy.category,
        skills: qy.skills,
        mode: qy.mode,
        radius: qy.radius,
        startsAfter: qy.starts_after,
        startsBefore: qy.starts_before,
        verifiedOrg: qy.verified_org === "true",
        urgency: qy.urgency,
        tab: qy.tab,
        orgSlug: qy.org,
        limit: qy.limit,
        offset
      });
      if (!user) res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      return res.json({
        items: result.items,
        nextCursor: result.nextOffset != null ? encodeCursor(result.nextOffset) : null,
        needsLocation: result.needsLocation,
        viewer: viewer.id && user && can(user, "volunteer:act") ? { timezone: viewer.timezone, radius: viewer.radius, hasLocation: viewer.lat != null } : null
      });
    })
  );

  app.get(
    "/v1/discovery/opportunities/:id",
    wrap(async (req, res) => {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const { user, viewer } = await viewerFor(req);
      return sendDetail(res, user, viewer, id.data);
    })
  );
}

/** Opportunity detail with the viewer's application, eligibility and (once accepted) the exact address. */
export async function sendDetail(res: import("express").Response, user: PolicyUser | null, viewer: Viewer, id: string) {
  // Applicants keep access to a request they applied to even after it fills or is paused.
  const applied = user
    ? await pool.query(
        "SELECT id, status, message, created_at FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 ORDER BY updated_at DESC LIMIT 1",
        [id, user.id]
      )
    : null;
  const application = applied?.rows[0] ?? null;
  const row = (await discoverOne(viewer, id)) ?? (application ? await discoverOne(viewer, id, { applicant: true }) : null);
  if (!row) return res.status(404).json({ message: "Opportunity not found" });
  const accepted = application && ["accepted", "confirmed", "completed"].includes(String(application.status));
  const saved = user ? await pool.query("SELECT 1 FROM volunteer_saved_requests WHERE user_id = $1 AND request_id = $2", [user.id, id]) : null;
  const eligibility = user && can(user, "volunteer:act") && !application ? await applyEligibility(user, id) : null;
  // Phone numbers, emails and links in the text stay masked until the volunteer is accepted (4.6).
  const text = accepted
    ? (await pool.query("SELECT description, accessibility_notes, equipment_notes FROM service_requests WHERE id = $1", [id])).rows[0]
    : row;
  return res.json({
    ...present(row, viewer),
    description: text.description,
    accessibility_notes: text.accessibility_notes,
    equipment_notes: text.equipment_notes,
    min_age: row.min_age,
    requires_background_check: row.requires_background_check,
    requires_training: row.requires_training,
    requires_waiver: row.requires_waiver,
    requires_car: row.requires_car,
    requires_guardian_consent: Boolean(row.requires_guardian_consent),
    // Target and unit (REQ-01/05): what's still open, in the request's own unit.
    target: row.target_value != null ? { value: row.target_value, unit: row.target_unit, min: row.min_contribution, committed: row.committed_amount, open: Math.max(0, Math.round((row.target_value - row.committed_amount) * 100) / 100), allow_overfill: row.allow_overfill } : null,
    // 4.5: the exact address is shared only with accepted volunteers.
    exact_address: accepted ? row.exact_address ?? null : null,
    address_hidden: Boolean(row.exact_address) && !accepted,
    application: application ? { id: application.id, status: application.status, message: application.message, created_at: application.created_at } : null,
    saved: Boolean(saved?.rowCount),
    can_apply: eligibility ? eligibility.eligible : false,
    eligibility: eligibility ? eligibility.problems : []
  });
}

