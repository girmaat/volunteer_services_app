import type { Express, Response } from "express";
import { z } from "zod";
import { ReviewBody } from "@volunteer_services_app/contracts";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import type { PolicyUser } from "../../lib/policy";
import { requireAuthedUser, requireVolunteerUser } from "../../middleware/auth";
import { notify, requestOwnerIds } from "../notifications/service";
import { afterApplicationUpdate } from "../requests/applications";
import { loadApplication, recordCommitmentCancel, reviewsFor, ReviewError, sideFor, submitReview } from "./service";

export { ReviewBody };

function sendReviewError(res: Response, e: unknown) {
  if (e instanceof ReviewError) return res.status(e.status).json({ error: { code: e.code, message: e.message }, message: e.message });
  throw e;
}

export function registerReviewRoutes(app: Express) {
  app.post(
    "/v1/reviews",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const p = ReviewBody.safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid review", errors: p.error.flatten() });
      try {
        const out = await submitReview(user, p.data.applicationId, p.data);
        return res.status(201).json(out);
      } catch (e) {
        return sendReviewError(res, e);
      }
    })
  );

  app.get(
    "/v1/reviews/applications/:id",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const out = await reviewsFor(user, id.data);
      if (!out) return res.status(404).json({ message: "Application not found" });
      return res.json(out);
    })
  );

  // A volunteer backs out after being accepted. Inside 24 h of the start it counts as a late cancellation.
  app.post(
    "/v1/volunteer/applications/:id/cancel",
    wrap(async (req, res) => {
      const user = (await requireVolunteerUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const reason = typeof req.body?.reason === "string" ? String(req.body.reason).slice(0, 500) : null;
      const a = await loadApplication(id.data);
      if (!a || a.volunteer_user_id !== user.id) return res.status(404).json({ message: "Application not found" });
      if (!["accepted", "confirmed"].includes(a.status)) return res.status(409).json({ message: `Use withdraw for an application that is ${a.status}` });
      await recordCommitmentCancel(a.id, "volunteer");
      await pool.query("UPDATE request_applications SET status = 'canceled', status_updated_at = NOW(), status_updated_by_user_id = $2, updated_at = NOW() WHERE id = $1", [a.id, user.id]);
      const late = await pool.query("SELECT late_cancel FROM request_commitments WHERE request_id = $1 AND volunteer_user_id = $2 ORDER BY updated_at DESC LIMIT 1", [a.request_id, user.id]);
      await afterApplicationUpdate(a.id, "canceled", user.id);
      const title = (await pool.query("SELECT title FROM service_requests WHERE id = $1", [a.request_id])).rows[0]?.title ?? "your request";
      for (const owner of await requestOwnerIds(a.request_id)) {
        await notify(owner, "request_updates", {
          title: `A volunteer canceled for “${title}”`,
          body: reason ?? "",
          href: a.requester_org_slug ? `/org/requests/${a.request_id}/applications` : `/requester/requests/${a.request_id}/applications`,
          email: {
            subject: `A volunteer canceled for “${title}”`,
            heading: "A volunteer had to cancel",
            lines: [reason ? `Their note: ${reason}` : "They didn't leave a note.", "If anyone was on the waitlist, the next person was moved up automatically."],
            cta: { label: "See your volunteers", url: a.requester_org_slug ? `/org/requests/${a.request_id}/applications` : `/requester/requests/${a.request_id}/applications` }
          }
        });
      }
      return res.json({ status: "canceled", late_cancel: Boolean(late.rows[0]?.late_cancel) });
    })
  );

  // The organizer records that an accepted volunteer didn't come.
  app.post(
    "/v1/applications/:id/no-show",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const a = await loadApplication(id.data);
      if (!a || sideFor(user, a) !== "owner") return res.status(404).json({ message: "Application not found" });
      if (!["accepted", "confirmed"].includes(a.status)) return res.status(409).json({ message: `Can't mark a no-show for an application that is ${a.status}` });
      const started = await pool.query(
        `SELECT COALESCE((SELECT start_at FROM request_commitments WHERE request_id = $1 AND volunteer_user_id = $2 ORDER BY updated_at DESC LIMIT 1), r.starts_at) AS start
           FROM service_requests r WHERE r.id = $1`,
        [a.request_id, a.volunteer_user_id]
      );
      const start = started.rows[0]?.start;
      if (!start || new Date(start) > new Date()) return res.status(409).json({ message: "You can mark a no-show after the start time." });
      const upd = await pool.query(
        `UPDATE request_commitments SET no_show = TRUE, no_show_marked_by_user_id = $3, no_show_marked_at = NOW(), status = 'canceled', updated_at = NOW()
          WHERE request_id = $1 AND volunteer_user_id = $2 RETURNING id`,
        [a.request_id, a.volunteer_user_id, user.id]
      );
      if (!upd.rowCount) {
        await pool.query(
          `INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, no_show, no_show_marked_by_user_id, no_show_marked_at)
           VALUES ($1, $2, 'canceled', $3, TRUE, $4, NOW())`,
          [a.volunteer_user_id, a.request_id, start, user.id]
        );
      }
      await pool.query("UPDATE request_applications SET status = 'canceled', status_updated_at = NOW(), status_updated_by_user_id = $2, updated_at = NOW() WHERE id = $1", [a.id, user.id]);
      await notify(a.volunteer_user_id, "application_status", {
        title: "You were marked as a no-show",
        body: "If this is wrong, open a dispute from your application and our team will review it.",
        href: `/volunteer/applications/${a.id}`
      });
      return res.json({ status: "canceled", no_show: true });
    })
  );

  // Either side can contest a review, a no-show or a late cancellation.
  app.post(
    "/v1/disputes",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const p = z
        .object({ applicationId: z.string().uuid(), kind: z.enum(["review", "no_show", "late_cancel", "other"]), reason: z.string().trim().min(10).max(2000) })
        .safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Explain what happened (at least a sentence)", errors: p.error.flatten() });
      const a = await loadApplication(p.data.applicationId);
      const side = a ? sideFor(user, a) : null;
      if (!a || !side) return res.status(404).json({ message: "Application not found" });
      const against = side === "volunteer" ? a.requester_user_id : a.volunteer_user_id;
      let reviewTable: string | null = null;
      let reviewId: string | null = null;
      if (p.data.kind === "review") {
        // The review about me, written by the other side.
        reviewTable = side === "volunteer" ? "volunteer_reviews" : "requester_reviews";
        const rv = await pool.query(`SELECT id FROM ${reviewTable} WHERE request_application_id = $1 AND visible_at IS NOT NULL AND removed_at IS NULL`, [a.id]);
        if (!rv.rowCount) return res.status(409).json({ message: "There's no published review to dispute." });
        reviewId = String(rv.rows[0].id);
      }
      const ins = await pool.query(
        `INSERT INTO disputes (application_id, request_id, kind, review_table, review_id, opened_by_user_id, against_user_id, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, created_at`,
        [a.id, a.request_id, p.data.kind, reviewTable, reviewId, user.id, against, p.data.reason]
      );
      return res.status(201).json(ins.rows[0]);
    })
  );

  app.get(
    "/v1/disputes",
    wrap(async (req, res) => {
      const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
      if (!user) return;
      const r = await pool.query(
        `SELECT d.id, d.kind, d.status, d.reason, d.decision_notes, d.created_at, d.decided_at, d.application_id, r.title AS request_title,
                (d.opened_by_user_id = $1) AS opened_by_me
           FROM disputes d LEFT JOIN service_requests r ON r.id = d.request_id
          WHERE d.opened_by_user_id = $1 OR d.against_user_id = $1
          ORDER BY d.created_at DESC LIMIT 100`,
        [user.id]
      );
      return res.json({ disputes: r.rows });
    })
  );
}
