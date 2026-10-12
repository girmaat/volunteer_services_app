/**
 * Applicants for one request, owner side, for individuals and organizations alike:
 * list with reliability and review state, and every decision through one endpoint.
 */
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { type AppRow, ownerReviewStates, RELIABILITY_SQL, recordCommitmentCancel, sideFor } from "../reviews/service";
import { acceptError, afterApplicationUpdate, checkAccept } from "./applications";
import { loadOwned } from "./routes";
import { minorSql } from "../../lib/age";
import { staffingCounts } from "./lifecycle";
import { requestProgress } from "./progress";
import { prerequisitesForRequest } from "../prerequisites/service";
import { calendarChanged } from "../calendar/updates";

const ACTIONS = ["accept", "waitlist", "decline", "reconsider", "confirm", "complete", "cancel"] as const;
type ActionName = (typeof ACTIONS)[number];

/** Allowed source statuses and resulting status per action. */
const MOVES: Record<ActionName, { from: string[]; to: string }> = {
  accept: { from: ["pending", "waitlisted", "offered"], to: "accepted" },
  waitlist: { from: ["pending"], to: "waitlisted" },
  decline: { from: ["pending", "waitlisted", "offered"], to: "rejected" },
  reconsider: { from: ["waitlisted"], to: "pending" },
  confirm: { from: ["accepted", "confirmed"], to: "confirmed" },
  complete: { from: ["confirmed", "accepted"], to: "completed" },
  cancel: { from: ["accepted", "confirmed"], to: "canceled" }
};

export function registerApplicantRoutes(app: Express) {
  app.get(
    "/v1/requests/:id/applicants",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id);
      if (!owned) return;
      const r = await pool.query(
        `SELECT a.id, a.status, a.offered_amount::float AS offered_amount, a.accepted_amount::float AS accepted_amount, a.offer_expires_at, CASE WHEN a.status IN ('accepted','confirmed','completed') THEN a.message ELSE mask_contacts(a.message) END AS message, a.created_at, a.updated_at, a.completed_at, a.volunteer_user_id,
                COALESCE(NULLIF(p.display_name, ''), 'Volunteer') AS display_name,
                p.avatar_url, COALESCE(p.public_location, p.location) AS public_location, p.bio, p.experience_tags AS skills,
                p.background_check_status, (u.verification_status = 'approved') AS verified,
                ${minorSql("a.volunteer_user_id")} AS minor,
                CASE WHEN a.status IN ('accepted','confirmed','completed') AND NOT ${minorSql("a.volunteer_user_id")} THEN u.email END AS email,
                CASE WHEN a.status IN ('accepted','confirmed','completed') AND NOT ${minorSql("a.volunteer_user_id")} THEN p.phone END AS phone,
                c.id AS commitment_id, c.status AS commitment_status, c.start_at, c.end_at, c.no_show, c.late_cancel, c.volunteer_confirmed_at,
                conv.id AS conversation_id,
                ${RELIABILITY_SQL("a.volunteer_user_id")} AS reliability,
                (SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), NULL) FROM visible_volunteer_reviews vr WHERE vr.volunteer_user_id = a.volunteer_user_id) AS avg_rating,
                (SELECT COUNT(*)::int FROM visible_volunteer_reviews vr WHERE vr.volunteer_user_id = a.volunteer_user_id) AS review_count,
                EXISTS (SELECT 1 FROM volunteer_reviews vr WHERE vr.request_application_id = a.id) AS reviewed_by_me
           FROM request_applications a
           JOIN users u ON u.id = a.volunteer_user_id
           LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
           LEFT JOIN LATERAL (SELECT * FROM request_commitments c WHERE c.request_id = a.request_id AND c.volunteer_user_id = a.volunteer_user_id ORDER BY c.updated_at DESC LIMIT 1) c ON TRUE
           LEFT JOIN conversations conv ON conv.request_id = a.request_id AND conv.volunteer_user_id = a.volunteer_user_id
          WHERE a.request_id = $1
          ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'confirmed' THEN 1 WHEN 'waitlisted' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END, a.created_at`,
        [owned.row.id]
      );
      const counts = await staffingCounts(pool, owned.row.id);
      const progress = await requestProgress(owned.row.id);
      // Prerequisites (forms, guardian consent, checks) for everyone who's in.
      const inIds = r.rows.filter((row) => ["accepted", "confirmed"].includes(row.status)).map((row) => String(row.volunteer_user_id));
      const pre = await prerequisitesForRequest(owned.row.id, inIds);
      // Review state for completed work, in one query instead of one request per volunteer.
      // Only someone who can review (the poster, or an org admin/manager) gets the review state.
      const reviewer = sideFor(owned.user, { volunteer_user_id: "", requester_user_id: owned.row.requester_user_id, requester_org_slug: owned.row.requester_org_slug } as AppRow) === "owner";
      const reviews = reviewer ? await ownerReviewStates(r.rows.filter((row) => row.status === "completed")) : new Map();
      const applicants = r.rows.map((row) => ({
        ...row,
        ...(["accepted", "confirmed"].includes(row.status) ? { prerequisites: pre.get(String(row.volunteer_user_id)) } : {}),
        ...(row.status === "completed" ? { review: reviews.get(String(row.id)) ?? null } : {})
      }));
      return res.json({
        request: {
          id: owned.row.id,
          title: owned.row.title,
          status: owned.row.status,
          volunteers_needed: owned.row.volunteers_needed,
          starts_at: owned.row.starts_at,
          ends_at: owned.row.ends_at,
          timezone: owned.row.timezone ?? null,
          requester_org_slug: owned.row.requester_org_slug,
          target: counts.target,
          unit: counts.unit,
          allow_overfill: counts.allowOverfill,
          offered: counts.offered,
          ...progress
        },
        applicants
      });
    })
  );

  app.post(
    "/v1/requests/:id/applicants/:appId",
    wrap(async (req, res) => {
      const owned = await loadOwned(req, res, req.params.id, { manage: true });
      if (!owned) return;
      const appId = z.string().uuid().safeParse(req.params.appId);
      const body = z
        .object({
          action: z.enum(ACTIONS),
          startAt: z.string().datetime({ offset: true }).optional(),
          endAt: z.string().datetime({ offset: true }).optional(),
          // Accept all or part of what the volunteer offered (REQ-05).
          acceptedAmount: z.coerce.number().positive().max(1_000_000).optional()
        })
        .safeParse(req.body ?? {});
      if (!appId.success || !body.success) return res.status(400).json({ message: "Invalid request" });
      const cur = await pool.query("SELECT id, status, volunteer_user_id, offered_amount::float AS offered_amount FROM request_applications WHERE id = $1 AND request_id = $2", [appId.data, owned.row.id]);
      const a = cur.rows[0];
      if (!a) return res.status(404).json({ message: "Applicant not found" });
      const move = MOVES[body.data.action];
      if (!move.from.includes(a.status)) return res.status(409).json({ message: `Can't ${body.data.action} an applicant who is ${a.status}` });
      let acceptedAmount: number | null = null;
      if (body.data.action === "accept") {
        const check = await checkAccept(a.id, body.data.acceptedAmount);
        if (!check.ok) return res.status(check.status).json(acceptError(check));
        acceptedAmount = check.acceptedAmount;
      }

      const rescheduled: string[] = [];
      if (body.data.action === "confirm") {
        const start = body.data.startAt ?? owned.row.starts_at;
        if (!start) return res.status(400).json({ message: "Pick a start time to confirm" });
        const end = body.data.endAt ?? owned.row.ends_at ?? null;
        const before = (await pool.query("SELECT id, start_at, end_at FROM request_commitments WHERE request_id = $1 AND volunteer_user_id = $2 AND status IN ('scheduled', 'confirmed')", [owned.row.id, a.volunteer_user_id])).rows[0];
        const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
        if (before?.start_at && (ms(before.start_at) !== ms(start) || ms(before.end_at) !== ms(end))) {
          rescheduled.push(String(before.id));
        }
        const up = await pool.query(
          "UPDATE request_commitments SET status = 'confirmed', start_at = $3, end_at = $4, updated_at = NOW() WHERE request_id = $1 AND volunteer_user_id = $2 RETURNING id",
          [owned.row.id, a.volunteer_user_id, start, end]
        );
        if (!up.rowCount) {
          await pool.query("INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, end_at) VALUES ($1, $2, 'confirmed', $3, $4)", [a.volunteer_user_id, owned.row.id, start, end]);
        }
      }
      if (body.data.action === "complete") {
        await pool.query("UPDATE request_commitments SET status = 'completed', updated_at = NOW() WHERE request_id = $1 AND volunteer_user_id = $2", [owned.row.id, a.volunteer_user_id]);
      }
      if (body.data.action === "cancel") await recordCommitmentCancel(a.id, "owner");

      await pool.query(
        "UPDATE request_applications SET status = $2, status_updated_at = NOW(), status_updated_by_user_id = $3, accepted_amount = COALESCE($4, accepted_amount), updated_at = NOW() WHERE id = $1",
        [a.id, move.to, owned.user.id, acceptedAmount]
      );
      await afterApplicationUpdate(a.id, move.to, owned.user.id);
      if (rescheduled.length) await calendarChanged(rescheduled, "update");
      return res.json({ id: a.id, status: move.to });
    })
  );
}
