/**
 * Volunteer prerequisites: the forms for a request (sign with a typed name; the exact version and
 * its hash are recorded) and guardian consent for volunteers under 18 (FORM-01..05, CASE-02).
 * Guardians respond on a public page reached from an emailed link; they don't need an account.
 */
import crypto from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { devEmailLink, sendEmail } from "../../auth/email";
import { ADULT_AGE, ageInfo, ageOn } from "../../lib/age";
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { wrap } from "../../lib/http";
import { requireVolunteerUser } from "../../middleware/auth";
import { notify, requestOwnerIds } from "../notifications/service";
import { prerequisites } from "./service";

const uuid = z.string().uuid();
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const web = (p: string) => `${env.WEB_BASE_URL.replace(/\/$/, "")}${p}`;

/** Requests a volunteer may see forms for: one they applied to, or any live one. */
async function visibleRequest(userId: string, requestId: string) {
  const r = await pool.query(
    `SELECT r.id, r.title, r.requester_org_slug, r.status, r.review_status,
            (SELECT a.id FROM request_applications a WHERE a.request_id = r.id AND a.volunteer_user_id = $2 ORDER BY a.created_at DESC LIMIT 1) AS application_id
       FROM service_requests r WHERE r.id = $1`,
    [requestId, userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const live = ["open", "pending", "filled"].includes(row.status) && row.review_status === "approved";
  return row.application_id || live ? row : null;
}

export function registerPrerequisiteRoutes(app: Express) {
  // Forms, consent and checks for one request, with what's done and what's left.
  app.get(
    "/v1/volunteer/requests/:id/prerequisites",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const r = await visibleRequest(user.id, id.data);
      if (!r) return res.status(404).json({ message: "Opportunity not found" });
      const pre = await prerequisites(user.id, id.data);
      const consent = await pool.query(
        "SELECT guardian_name, guardian_email, relationship, status, requested_at, responded_at FROM guardian_consents WHERE volunteer_user_id = $1 AND request_id = $2 AND status <> 'replaced' ORDER BY requested_at DESC LIMIT 1",
        [user.id, id.data]
      );
      return res.json({ ...pre, application_id: r.application_id ?? null, guardian: consent.rows[0] ?? null });
    })
  );

  // Sign the current version of a form: typed full name plus an explicit "I agree".
  app.post(
    "/v1/volunteer/documents/:id/sign",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      const body = z.object({ request_id: uuid, signer_name: z.string().trim().min(2).max(120), agree: z.literal(true) }).safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Type your full name and tick “I agree” to sign" });
      const r = await visibleRequest(user.id, body.data.request_id);
      if (!r || !r.requester_org_slug) return res.status(404).json({ message: "Opportunity not found" });
      const doc = await pool.query(
        `SELECT d.id, d.current_version, v.title, v.sha256, a.required_before
           FROM org_document_assignments a
           JOIN org_documents d ON d.id = a.org_document_id
           JOIN org_document_versions v ON v.document_id = d.id AND v.version = d.current_version
          WHERE d.id = $1 AND d.org_slug = $2 AND d.active AND (a.request_id = $3 OR a.request_id IS NULL)
          ORDER BY a.request_id NULLS LAST LIMIT 1`,
        [id.data, r.requester_org_slug, body.data.request_id]
      );
      const d = doc.rows[0];
      if (!d) return res.status(404).json({ message: "This form isn't part of this opportunity" });
      if (d.required_before === "check_in" && !r.application_id) return res.status(403).json({ message: "Apply first; this form is signed before your shift." });
      await pool.query(
        `INSERT INTO volunteer_document_acks (org_document_id, volunteer_user_id, request_id, document_version, sha256, signer_name, signature_method, presented_title)
         VALUES ($1, $2, $3, $4, $5, $6, 'typed_name', $7)
         ON CONFLICT (org_document_id, volunteer_user_id, request_id, document_version) DO NOTHING`,
        [d.id, user.id, body.data.request_id, d.current_version, d.sha256, body.data.signer_name, d.title]
      );
      return res.json({ ok: true, version: Number(d.current_version), prerequisites: await prerequisites(user.id, body.data.request_id) });
    })
  );

  // Ask a parent or guardian for consent (volunteers under 18, requests that need it).
  app.post(
    "/v1/volunteer/applications/:id/guardian",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = uuid.safeParse(req.params.id);
      const body = z
        .object({ guardianName: z.string().trim().min(2).max(120), guardianEmail: z.string().trim().toLowerCase().email().max(200), relationship: z.enum(["parent", "legal_guardian"]) })
        .safeParse(req.body ?? {});
      if (!id.success || !body.success) return res.status(400).json({ message: "Enter your parent or guardian's name and email" });
      const a = (
        await pool.query(
          `SELECT a.id, a.request_id, a.status, r.title, r.requires_guardian_consent, r.starts_at, o.name AS org_name
             FROM request_applications a JOIN service_requests r ON r.id = a.request_id LEFT JOIN organizations o ON o.slug = r.requester_org_slug
            WHERE a.id = $1 AND a.volunteer_user_id = $2`,
          [id.data, user.id]
        )
      ).rows[0];
      if (!a) return res.status(404).json({ message: "Application not found" });
      if (!a.requires_guardian_consent) return res.status(409).json({ message: "This opportunity doesn't need a guardian's consent" });
      if (!["pending", "accepted", "confirmed", "waitlisted", "offered"].includes(a.status)) return res.status(409).json({ message: "This application is closed" });
      const info = await ageInfo(user.id);
      const age = ageOn(info.birthDate, a.starts_at && new Date(a.starts_at) > new Date() ? new Date(a.starts_at) : new Date());
      if (age === null || age >= ADULT_AGE) return res.status(409).json({ message: "Consent is only needed for volunteers under 18" });
      // The volunteer can't be their own guardian (FORM-03).
      const own = await pool.query("SELECT 1 FROM users WHERE id = $1 AND lower(email) = $2", [user.id, body.data.guardianEmail]);
      if (own.rowCount) return res.status(422).json({ message: "Use your parent or guardian's own email address, not yours" });
      // Consent emails go to an address the volunteer typed, so they're limited: 3 per application and
      // 5 per volunteer in any 24 hours.
      const recent = (
        await pool.query(
          `SELECT COUNT(*) FILTER (WHERE application_id = $2)::int AS app, COUNT(*)::int AS total
             FROM guardian_consents WHERE volunteer_user_id = $1 AND requested_at > NOW() - INTERVAL '24 hours'`,
          [user.id, id.data]
        )
      ).rows[0];
      if (recent.app >= 3 || recent.total >= 5) {
        return res.status(429).json({ error: { code: "too_many_requests", message: "You've sent several consent requests today. Try again tomorrow, or ask the organizer for help." }, message: "You've sent several consent requests today. Try again tomorrow, or ask the organizer for help." });
      }

      const token = crypto.randomBytes(24).toString("base64url");
      await pool.query("UPDATE guardian_consents SET status = 'replaced' WHERE volunteer_user_id = $1 AND request_id = $2 AND status = 'pending'", [user.id, a.request_id]);
      await pool.query(
        `INSERT INTO guardian_consents (volunteer_user_id, request_id, application_id, guardian_name, guardian_email, relationship, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '14 days')`,
        [user.id, a.request_id, a.id, body.data.guardianName, body.data.guardianEmail, body.data.relationship, sha(token)]
      );
      const first = String((await pool.query("SELECT COALESCE(NULLIF(display_name, ''), split_part(full_name, ' ', 1)) AS n FROM user_profiles WHERE user_id = $1", [user.id])).rows[0]?.n || "Your child");
      const url = web(`/guardian/consent/${token}`);
      const delivery = await sendEmail({
        to: body.data.guardianEmail,
        subject: `${first} would like to volunteer with ${a.org_name ?? "an organization"}`,
        text: [
          `Hello ${body.data.guardianName},`,
          "",
          `${first} signed up on ThankYou to volunteer for “${a.title}” with ${a.org_name ?? "a local organization"}. Because they're under 18, the organization asks for a parent or guardian's consent.`,
          "",
          `Read the details and give or decline consent: ${url}`,
          "",
          "The link works for 14 days. If you don't know about this, you can ignore this email."
        ].join("\n")
      });
      return res.status(201).json({ ok: true, status: "pending", dev_consent_url: devEmailLink(url, delivery.delivery) });
    })
  );

  // ---- Public guardian page ------------------------------------------------------------------
  app.get(
    "/v1/public/guardian-consents/:token",
    wrap(async (req, res) => {
      res.setHeader("cache-control", "no-store");
      const token = String(req.params.token || "");
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return res.status(404).json({ message: "This link isn't valid" });
      const r = await pool.query(
        `SELECT g.guardian_name, g.relationship, g.status, g.expires_at, g.responded_at,
                COALESCE(NULLIF(p.display_name, ''), split_part(p.full_name, ' ', 1)) AS volunteer_first_name,
                r.title, r.description, r.starts_at, r.ends_at, r.timezone, r.mode, r.public_area, r.min_age, r.accessibility_notes, r.equipment_notes,
                r.requires_background_check, o.name AS org_name, o.verification_status = 'approved' AS org_verified
           FROM guardian_consents g
           JOIN service_requests r ON r.id = g.request_id
           LEFT JOIN organizations o ON o.slug = r.requester_org_slug
           LEFT JOIN user_profiles p ON p.user_id = g.volunteer_user_id
          WHERE g.token_hash = $1`,
        [sha(token)]
      );
      const g = r.rows[0];
      if (!g || g.status === "replaced") return res.status(404).json({ message: "This link isn't valid any more" });
      const expired = g.status === "pending" && new Date(g.expires_at) < new Date();
      return res.json({ ...g, state: expired ? "expired" : g.status });
    })
  );

  app.post(
    "/v1/public/guardian-consents/:token",
    wrap(async (req, res) => {
      const token = String(req.params.token || "");
      const body = z
        .object({ decision: z.enum(["grant", "decline"]), signedName: z.string().trim().min(2).max(120), confirmGuardian: z.literal(true) })
        .safeParse(req.body ?? {});
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !body.success) return res.status(400).json({ message: "Type your full name and confirm you're the parent or legal guardian" });
      const r = await pool.query(
        `UPDATE guardian_consents SET status = $2, signed_name = $3, responded_at = NOW()
          WHERE token_hash = $1 AND status = 'pending' AND expires_at > NOW()
          RETURNING volunteer_user_id, request_id, application_id`,
        [sha(token), body.data.decision === "grant" ? "granted" : "declined", body.data.signedName]
      );
      const g = r.rows[0];
      if (!g) return res.status(409).json({ message: "This link was already used or has expired" });
      const title = (await pool.query("SELECT title FROM service_requests WHERE id = $1", [g.request_id])).rows[0]?.title ?? "your opportunity";
      const granted = body.data.decision === "grant";
      await notify(String(g.volunteer_user_id), "prerequisites", {
        title: granted ? `Your guardian gave consent for “${title}”` : `Your guardian declined consent for “${title}”`,
        href: g.application_id ? `/volunteer/applications/${g.application_id}` : "/volunteer/applications"
      });
      for (const owner of await requestOwnerIds(String(g.request_id))) {
        await notify(owner, "prerequisites", { title: `Guardian ${granted ? "consent received" : "declined"} for a volunteer on “${title}”`, href: `/org/requests/${g.request_id}/applications` });
      }
      return res.json({ ok: true, status: granted ? "granted" : "declined" });
    })
  );
}
