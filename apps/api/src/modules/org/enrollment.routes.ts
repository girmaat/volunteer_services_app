import { HttpUrl, OrgType } from "@thankyou/contracts";
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomTokenUrlSafe, sha256 } from "../../auth/crypto";
import { devEmailLink, sendEmail } from "../../auth/email";
import { requireUserBySession } from "../../auth/session";
import { staffAdultCheck } from "../../lib/age";
import { MediaPath } from "../../lib/media";
import { notify } from "../notifications/service";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { authHeaderToken, getOrgContextForUser, pgErrorCode, requireAdmin, requireOrg, slugifyOrgSlug, webBaseUrl } from "./context";

/** A free slug for a new organization: "riverside-mutual-aid", then "-2", "-3"… */
async function uniqueOrgSlug(name: string) {
  const base = slugifyOrgSlug(name).slice(0, 60) || "organization";
  const taken = new Set(
    (await pool.query("SELECT slug FROM organizations WHERE slug = $1 OR slug LIKE $2", [base, `${base}-%`])).rows.map((r) => String(r.slug))
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

export function registerOrgEnrollmentRoutes(app: Express) {

  // Legacy endpoint (removed by orgReq)

  // OrgReq Phase 1: Public org enrollment (creates org + first admin user)
  app.post(
    "/v1/orgs/enroll",
    wrap(async (req, res) => {
      const schema = z.object({
        org: z.object({
          name: z.string().trim().min(2),
          // Optional: generated from the name (and made unique) when left out.
          slug: z.string().min(2).optional().nullable(),
          summary: z.string().trim().min(10, "Describe what your organization does in a sentence"),
          location: z.string().trim().min(2),
          mission: z.string().min(2).optional().nullable(),
          website_url: HttpUrl.optional().nullable(),
          // Optional: defaults to the admin's email.
          contact_email: z.string().email().optional().nullable(),
          org_type: OrgType.optional()
        }),
        admin: z.object({
          fullName: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(8),
          // Organization staff confirm they're adults instead of giving a birth date.
          adultConfirmed: z.literal(true, { errorMap: () => ({ message: "Confirm you're 18 or older" }) })
        })
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const email = parsed.data.admin.email.toLowerCase().trim();
      const orgSlug = parsed.data.org.slug ? slugifyOrgSlug(parsed.data.org.slug) : await uniqueOrgSlug(parsed.data.org.name);
      if (!orgSlug) return res.status(400).json({ message: "Invalid org slug" });
      const contactEmail = parsed.data.org.contact_email || email;

      const existingUser = await pool.query("SELECT id, email_verified_at FROM users WHERE email=$1", [email]);
      if ((existingUser.rowCount ?? 0) > 0) {
        // Don't reveal that the address has an account (the same answer as a new sign-up); tell its owner instead.
        await sendEmail({
          to: email,
          subject: "You already have a ThankYou account",
          text: `Someone (maybe you) tried to register an organization on ThankYou with this email address, which already has an account.

To add an organization to your account, sign in and open: ${webBaseUrl()}/org/signup
Forgot your password? ${webBaseUrl()}/forgot-password

If this wasn't you, you can ignore this email.`
        });
        return res.status(202).json({ status: "accepted" });
      }

      const existingOrg = await pool.query("SELECT slug FROM organizations WHERE slug=$1", [orgSlug]);
      if ((existingOrg.rowCount ?? 0) > 0) return res.status(409).json({ message: "Organization slug already in use" });

      const passwordHash = await bcrypt.hash(parsed.data.admin.password, 12);

      // Create user (org team member)
      const userRows = await pool.query(
        // Org-only account: no volunteer/requester profile to fill in. Verification belongs to the
        // organization (organizations.verification_status), not to the person.
        `INSERT INTO users (email, password_hash, role, account_type, profile_completed, availability_completed, onboarding_completed, verification_required, verification_status, adult_attested_at)
         VALUES ($1, $2, 'org_admin', 'org_team_member', TRUE, TRUE, TRUE, FALSE, 'not_required', NOW())
         RETURNING id`,
        [email, passwordHash]
      );
      const userId = String(userRows.rows[0].id);

      await pool.query(
        `INSERT INTO user_profiles (user_id, full_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET full_name=EXCLUDED.full_name, updated_at=NOW()`,
        [userId, parsed.data.admin.fullName]
      );

      // Create org
      await pool.query(
        `INSERT INTO organizations (slug, name, summary, location, mission, website_url, contact_email, created_by_user_id, verification_required, verification_status, org_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'required', $9)`,
        [
          orgSlug,
          parsed.data.org.name,
          parsed.data.org.summary,
          parsed.data.org.location,
          parsed.data.org.mission ?? null,
          parsed.data.org.website_url ?? null,
          contactEmail,
          userId,
          parsed.data.org.org_type ?? "nonprofit"
        ]
      );

      // Create membership (admin)
      await pool.query(
        `INSERT INTO organization_members (org_slug, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')
         ON CONFLICT (org_slug, user_id) DO NOTHING`,
        [orgSlug, userId]
      );

      // Email verification (same pattern as /v1/auth/signup)
      const token = randomTokenUrlSafe(32);
      const tokenHash = sha256(token);

      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [userId, tokenHash]
      );

      const verifyUrl = `${webBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
      const delivery = await sendEmail({
        to: email,
        subject: "Verify your ThankYou email",
        text: `Welcome to ThankYou!

Verify your email to continue:
${verifyUrl}

If you didn't create this account, you can ignore this email.`
      });

      const dev_verify_url = devEmailLink(verifyUrl, delivery.delivery);

      return res.status(202).json({ status: "accepted", org: { slug: orgSlug }, emailDelivery: delivery.delivery, dev_verify_url });
    })
  );

  // Authenticated org creation (converts an existing requester into an org admin and creates the org + membership)
  app.post(
    "/v1/orgs/create",
    wrap(async (req, res) => {
      const token = authHeaderToken(req);
      if (!token) return res.status(401).json({ message: "Not authenticated" });

      const user = await requireUserBySession(pool, token);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      // Any signed-in person with a verified email can start an organization. Their volunteer or
      // requester roles stay; organization access comes from the membership.
      if (!user.email_verified_at) return res.status(403).json({ message: "Verify your email first" });

      const schema = z.object({
        org: z.object({
          name: z.string().trim().min(2),
          slug: z.string().min(2).optional().nullable(),
          summary: z.string().trim().min(10, "Describe what your organization does in a sentence"),
          location: z.string().trim().min(2),
          mission: z.string().min(2).optional().nullable(),
          website_url: HttpUrl.optional().nullable(),
          contact_email: z.string().email().optional().nullable()
        }),
        admin: z.object({ fullName: z.string().trim().min(1).optional(), phone: z.string().trim().max(40).optional(), adultConfirmed: z.boolean().optional() }).optional()
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
      const notAdult = await staffAdultCheck(String(user.id), parsed.data.admin?.adultConfirmed);
      if (notAdult) return res.status(403).json({ message: notAdult, code: "adult_required" });

      const orgSlug = parsed.data.org.slug ? slugifyOrgSlug(parsed.data.org.slug) : await uniqueOrgSlug(parsed.data.org.name);
      if (!orgSlug) return res.status(400).json({ message: "Invalid org slug" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const existingOrg = await client.query("SELECT 1 FROM organizations WHERE slug=$1", [orgSlug]);
        if (existingOrg.rowCount) {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "Organization slug already in use" });
        }
        const uid = String(user.id);
        await client.query(
          `INSERT INTO organizations (slug, name, summary, location, mission, website_url, contact_email, created_by_user_id, verification_required, verification_status, onboarding_completed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'required', FALSE)`,
          [orgSlug, parsed.data.org.name, parsed.data.org.summary, parsed.data.org.location, parsed.data.org.mission ?? null, parsed.data.org.website_url ?? null, parsed.data.org.contact_email || String(user.email), uid]
        );
        await client.query("INSERT INTO organization_members (org_slug, user_id, role, status, joined_at) VALUES ($1, $2, 'admin', 'active', NOW())", [orgSlug, uid]);

        // An account with no volunteer/requester role becomes an org-only account; anyone else keeps
        // their roles and gains the organization as another context.
        const roles = await client.query("SELECT 1 FROM user_roles WHERE user_id = $1 LIMIT 1", [String(user.id)]);
        if (!roles.rowCount) {
          await client.query(
            `UPDATE users SET role = 'org_admin', account_type = 'org_team_member', profile_completed = TRUE, availability_completed = TRUE,
                    onboarding_completed = TRUE, verification_required = FALSE, verification_status = 'not_required', updated_at = NOW()
              WHERE id = $1`,
            [String(user.id)]
          );
        }
        if (parsed.data.admin?.fullName || parsed.data.admin?.phone) {
          await client.query(
            `INSERT INTO user_profiles (user_id, full_name, phone) VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name), phone = COALESCE(EXCLUDED.phone, user_profiles.phone), updated_at = NOW()`,
            [String(user.id), parsed.data.admin?.fullName ?? null, parsed.data.admin?.phone ?? null]
          );
        }
        await client.query("UPDATE sessions SET active_context = $2 WHERE session_token = session_key($1)", [token, `org:${orgSlug}`]);

        await client.query("COMMIT");
        return res.status(201).json({ org: { slug: orgSlug } });
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {}

        const code = pgErrorCode(e);
        if (code === "23505") {
          return res.status(409).json({ message: "Organization slug already in use" });
        }

        throw e;
      } finally {
        client.release();
      }
    })
  );

// OrgReq Phase 1.5: Join an existing org by email-domain match (authenticated org requester/team member).
// This prevents users from bypassing org setup by landing on /dashboard without org context.
app.post(
  "/v1/orgs/join",
  wrap(async (req, res) => {
    const token = authHeaderToken(req);
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const user = await requireUserBySession(pool, token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    // Any signed-in person with a verified email may join (their own roles stay).
    if (!user.email_verified_at) return res.status(403).json({ message: "Verify your email first" });

    // No switching: if already active in any org, block join.
    const existing = await pool.query(
      "SELECT org_slug FROM organization_members WHERE user_id=$1 AND status='active' LIMIT 1",
      [String(user.id)]
    );
    if ((existing.rowCount ?? 0) > 0) {
      return res.status(409).json({ message: "Already a member of an organization" });
    }

    const schema = z.object({
      orgSlug: z.string().min(2),
      adultConfirmed: z.boolean().optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    const notAdult = await staffAdultCheck(String(user.id), parsed.data.adultConfirmed);
    if (notAdult) return res.status(403).json({ message: notAdult, code: "adult_required" });

    const orgSlug = slugifyOrgSlug(parsed.data.orgSlug);
    if (!orgSlug) return res.status(400).json({ message: "Invalid org slug" });

    
    // Joining is a request an admin approves. An email domain alone never makes someone staff:
    // shared providers (gmail.com…) would let anyone in.
    const org = (await pool.query("SELECT slug, name FROM organizations WHERE slug = $1", [orgSlug])).rows[0];
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const uid = String(user.id);
    const pending = await pool.query("SELECT org_slug FROM organization_members WHERE user_id = $1 AND status = 'requested'", [uid]);
    if (pending.rowCount) {
      const same = pending.rows.some((r) => r.org_slug === orgSlug);
      return res.status(same ? 200 : 409).json(same ? { status: "requested", org: { slug: orgSlug } } : { message: "You already asked to join another organization. Wait for its answer first." });
    }
    await pool.query(
      `INSERT INTO organization_members (org_slug, user_id, role, status, requested_at)
       VALUES ($1, $2, 'member', 'requested', NOW())
       ON CONFLICT (org_slug, user_id) DO NOTHING`,
      [orgSlug, uid]
    );
    const admins = await pool.query("SELECT user_id FROM organization_members WHERE org_slug = $1 AND role = 'admin' AND status = 'active'", [orgSlug]);
    const who = String(user.email || "Someone");
    for (const a of admins.rows) {
      await notify(String(a.user_id), "request_updates", {
        title: `${who} asked to join ${org.name}`,
        body: "Approve or decline on your Team page.",
        href: "/org/team#requests",
        email: { subject: `Join request for ${org.name}`, heading: `${who} asked to join ${org.name}`, lines: ["Only approve people you know work or volunteer with you. They'll see applicants and messages."], cta: { label: "Review the request", url: "/org/team#requests" } }
      });
    }
    return res.status(202).json({ status: "requested", org: { slug: orgSlug } });
  })
);

  // Phase 2: Change org slug (admin only). This updates all FK references.
  app.post(
    "/v1/orgs/:orgSlug/slug",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (ok.ctx.org.slug !== String(req.params.orgSlug)) return res.status(404).json({ message: "Org not found" });
      if (!requireAdmin(ok.ctx, res)) return;

      const schema = z.object({ slug: z.string().min(2) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const newSlug = slugifyOrgSlug(parsed.data.slug);
      if (!newSlug) return res.status(400).json({ message: "Invalid org slug" });

      const oldSlug = ok.ctx.org.slug;
      if (newSlug === oldSlug) return res.json({ org: { slug: oldSlug } });

      const existingOrg = await pool.query("SELECT slug FROM organizations WHERE slug=$1", [newSlug]);
      if ((existingOrg.rowCount ?? 0) > 0) return res.status(409).json({ message: "Organization slug already in use" });

      // One UPDATE: every table that references the organization follows it (ON UPDATE CASCADE,
      // migration 0014), so nothing is copied, deleted or left behind.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const up = await client.query("UPDATE organizations SET slug = $2, updated_at = NOW() WHERE slug = $1 RETURNING slug", [oldSlug, newSlug]);
        if (!up.rowCount) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Org not found" });
        }
        // Text references that aren't foreign keys.
        await client.query("UPDATE sessions SET active_context = $2 WHERE active_context = $1", [`org:${oldSlug}`, `org:${newSlug}`]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        if (pgErrorCode(e) === "23505") return res.status(409).json({ message: "Organization slug already in use" });
        throw e;
      } finally {
        client.release();
      }

      return res.json({ org: { slug: newSlug } });
    })
  );

  // Phase 2: Update org profile (admin only)
  app.patch(
    "/v1/orgs/:orgSlug",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (ok.ctx.org.slug !== String(req.params.orgSlug)) return res.status(404).json({ message: "Org not found" });
      if (!requireAdmin(ok.ctx, res)) return;

      // Load current org so we can validate completion rules against the post-update shape.
      const currentOrgRes = await pool.query(
        "SELECT slug, name, summary, location, contact_email, mission, website_url, logo_url, onboarding_completed FROM organizations WHERE slug=$1",
        [ok.ctx.org.slug]
      );
      if ((currentOrgRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Org not found" });
      const currentOrg = currentOrgRes.rows[0];

      const schema = z.object({
        name: z.string().min(2).optional(),
        summary: z.string().min(10).optional(),
        location: z.string().min(2).optional(),
        mission: z.string().min(2).optional().nullable(),
        website_url: HttpUrl.optional().nullable(),
        contact_email: z.string().email().optional(),
        logo_url: MediaPath.optional(),
        onboarding_completed: z.boolean().optional(),
        preferred_skills: z
          .union([z.array(z.string()), z.string()])
          .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 30))
          .optional(),
        service_area: z.string().trim().max(200).optional().nullable(),
        hours: z.string().trim().max(500).optional().nullable(),
        contact_phone: z.string().trim().max(40).optional().nullable(),
        preferred_contact_method: z.enum(["in_app", "email", "phone"]).optional().nullable(),
        // GOV-01: which requests need an owner's approval before a manager can publish them.
        publication_policy: z.enum(["owner_all", "owner_first_and_high_risk", "delegated"]).optional(),
        org_type: OrgType.optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const p = parsed.data;
      // Coordinators exist only in schools: a school with coordinators can't change type until they're reassigned.
      if (p.org_type && p.org_type !== "school") {
        const c = await pool.query("SELECT 1 FROM organization_members WHERE org_slug = $1 AND role = 'coordinator' AND status IN ('active','invited') LIMIT 1", [ok.ctx.org.slug]);
        if (c.rowCount) return res.status(409).json({ message: "Change your coordinators to another role before changing the organization type" });
      }

      const finalName = p.name ?? String(currentOrg.name || "");
      const finalSummary = p.summary ?? String(currentOrg.summary || "");
      const finalLocation = p.location ?? String(currentOrg.location || "");
      const finalContactEmail = (typeof p.contact_email === "string" ? p.contact_email : currentOrg.contact_email) as
        | string
        | null;

      // Enforce spec minimums when finishing onboarding.
      if (p.onboarding_completed === true && !currentOrg.onboarding_completed) {
        if (!finalName || finalName.trim().length < 2) {
          return res.status(400).json({ message: "Organization name is required" });
        }
        if (!finalLocation || finalLocation.trim().length < 2) {
          return res.status(400).json({ message: "Organization location is required" });
        }
        if (!finalSummary || finalSummary.trim().length < 10) {
          return res.status(400).json({ message: "Organization summary is required" });
        }
        if (!finalContactEmail) {
          return res.status(400).json({ message: "Contact email is required" });
        }

        // Also require the admin's name before org onboarding can complete.
        const adminProfileRes = await pool.query(
          "SELECT full_name, phone FROM user_profiles WHERE user_id=$1",
          [String(ok.user.id)]
        );
        const adminProfile = adminProfileRes.rows[0];
        // A named point of contact is required; a phone number is optional (messages and the
        // organization's contact email cover it).
        const adminNameOk = Boolean(String(adminProfile?.full_name || "").trim());
        if (!adminNameOk) {
          return res.status(400).json({ message: "Add your name as the organization's point of contact" });
        }
      }

      await pool.query(
        `
        UPDATE organizations
        SET
          name = COALESCE($2, name),
          summary = COALESCE($3, summary),
          location = COALESCE($4, location),
          mission = COALESCE($5, mission),
          website_url = COALESCE($6, website_url),
          contact_email = COALESCE($7, contact_email),
          logo_url = COALESCE($8, logo_url),
          onboarding_completed = COALESCE($9, onboarding_completed),
          preferred_skills = COALESCE($10, preferred_skills),
          service_area = COALESCE($11, service_area),
          hours = COALESCE($12, hours),
          contact_phone = COALESCE($13, contact_phone),
          preferred_contact_method = COALESCE($14, preferred_contact_method),
          publication_policy = COALESCE($15, publication_policy),
          org_type = COALESCE($16, org_type),
          updated_at = NOW()
        WHERE slug = $1
        `,
        [
          ok.ctx.org.slug,
          p.name ?? null,
          p.summary ?? null,
          p.location ?? null,
          p.mission ?? null,
          p.website_url ?? null,
          typeof p.contact_email === "string" ? p.contact_email : null,
          p.logo_url ?? null,
          typeof p.onboarding_completed === "boolean" ? p.onboarding_completed : null,
          p.preferred_skills ?? null,
          p.service_area ?? null,
          p.hours ?? null,
          p.contact_phone ?? null,
          p.preferred_contact_method ?? null,
          p.publication_policy ?? null,
          p.org_type ?? null
        ]
      );

      // Finishing org onboarding also finishes the admin's own account onboarding (an org-only
      // account has no volunteer or requester profile to fill in), or every API call stays 403.
      if (p.onboarding_completed === true) {
        await pool.query(
          "UPDATE users SET profile_completed = TRUE, onboarding_completed = TRUE, updated_at = NOW() WHERE id = $1 AND NOT onboarding_completed",
          [String(ok.user.id)]
        );
      }

      const ctx = await getOrgContextForUser(pool, String(ok.user.id), ok.ctx.org.slug);
      return res.json(ctx);
    })
  );

  // Phase 3/4: Dashboard tiles
  // Phase 2b: Org verification submission (admin only)
  app.post(
    "/v1/orgs/:orgSlug/verification/submit",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (ok.ctx.org.slug !== String(req.params.orgSlug)) return res.status(404).json({ message: "Org not found" });
      if (!requireAdmin(ok.ctx, res)) return;

      const schema = z.object({
        submission_notes: z.string().max(4000).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const notes = parsed.data.submission_notes ? String(parsed.data.submission_notes).trim() : null;

      const cur = await pool.query("SELECT verification_status FROM organizations WHERE slug=$1", [ok.ctx.org.slug]);
      const status = (cur.rows?.[0]?.verification_status ? String(cur.rows[0].verification_status) : "not_required").toLowerCase();
      if (status === "approved" || status === "verified") {
        return res.status(409).json({ message: "Organization is already verified." });
      }
      if (status === "suspended") {
        return res.status(409).json({ message: "This organization is suspended. Reply to the notice from ThankYou to ask for a review." });
      }

      await pool.query(
        `
        UPDATE organizations
           SET verification_required=TRUE,
               verification_status='submitted',
               verification_submitted_at=NOW(),
               verification_submission_notes=$2,
               updated_at=NOW()
         WHERE slug=$1
        `,
        [ok.ctx.org.slug, notes]
      );

      const ctx = await getOrgContextForUser(pool, String(ok.user.id), ok.ctx.org.slug);
      return res.json({ ok: true, org: ctx?.org ?? ok.ctx.org });
    })
  );
}
