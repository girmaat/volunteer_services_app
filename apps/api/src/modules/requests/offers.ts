/**
 * Waitlist offers (REQ-07): when a spot opens, the next waitlisted volunteer is offered it and has
 * 24 hours to accept. Declining or letting it lapse passes the offer to the next person.
 */
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireVolunteerUser } from "../../middleware/auth";
import { afterApplicationUpdate } from "./applications";
import { syncStaffing } from "./lifecycle";

/** Hourly: offers nobody answered expire and go to the next person. */
export async function expireOffers() {
  const r = await pool.query(
    `UPDATE request_applications SET status = 'offer_expired', status_updated_at = NOW(), updated_at = NOW()
      WHERE status = 'offered' AND offer_expires_at < NOW() RETURNING request_id`
  );
  for (const id of new Set(r.rows.map((x) => String(x.request_id)))) await syncStaffing(id);
  return r.rowCount ?? 0;
}

export function registerOfferRoutes(app: Express) {
  app.post(
    "/v1/volunteer/applications/:id/offer",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      const body = z.object({ accept: z.boolean() }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Say whether you'll take the spot" });
      const a = (await pool.query("SELECT id, status, offer_expires_at, offered_amount FROM request_applications WHERE id = $1 AND volunteer_user_id = $2", [id.data, user.id])).rows[0];
      if (!a) return res.status(404).json({ message: "Application not found" });
      if (a.status !== "offered") return res.status(409).json({ message: "There's no open offer on this application" });
      if (new Date(a.offer_expires_at) < new Date()) {
        await expireOffers();
        return res.status(409).json({ message: "This offer expired and went to the next person" });
      }
      const next = body.data.accept ? "accepted" : "withdrawn";
      await pool.query(
        `UPDATE request_applications SET status = $2, accepted_amount = CASE WHEN $2 = 'accepted' THEN offered_amount ELSE accepted_amount END,
                offer_expires_at = NULL, status_updated_at = NOW(), status_updated_by_user_id = $3, updated_at = NOW() WHERE id = $1`,
        [a.id, next, user.id]
      );
      await afterApplicationUpdate(a.id, next, user.id);
      return res.json({ id: a.id, status: next });
    })
  );
}
