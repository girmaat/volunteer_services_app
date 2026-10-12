import type { Express } from "express";
import { z } from "zod";
import { randomTokenUrlSafe, sha256 } from "../../auth/crypto";
import { sendEmail } from "../../auth/email";
import { requireUserBySession } from "../../auth/session";
import { staffAdultCheck } from "../../lib/age";
import { notify } from "../notifications/service";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { authHeaderToken, requireAdmin, requireAdminOrManager, requireOrg, webBaseUrl } from "./context";

export function registerOrgTeamRoutes(app: Express) {



  // Phase 1/4: Members (existing UI uses these; kept)
  app.get(
    "/v1/org/members",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;

      const rows = await pool.query(
        `
        SELECT
          m.id AS member_id,
          m.user_id,
          COALESCE(u.email, m.invited_email) AS email,
          m.invited_email,
          p.full_name,
          m.role,
          m.status,
          m.requested_at,
          m.created_at,
          m.updated_at
        FROM organization_members m
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE m.org_slug = $1
        ORDER BY
          CASE m.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
          COALESCE(p.full_name, u.email, m.invited_email) ASC
        `,
        [ok.ctx.org.slug]
      );

      return res.json({ org: ok.ctx.org, membership: ok.ctx.membership, members: rows.rows });
    })
  );


  
  app.post(
    "/v1/org/members",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const schema = z.object({
        email: z.string().email(),
        role: z.enum(["member", "coordinator", "manager", "admin"]).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
      if (parsed.data.role === "coordinator" && !(await isSchool(ok.ctx.org.slug))) return res.status(400).json({ message: "Coordinators are for schools" });

      const email = String(parsed.data.email || "").trim().toLowerCase();
      const role = parsed.data.role || "member";

      // If they're already an active member, just update role.
      const active = await pool.query(
        `
        SELECT m.id
        FROM organization_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.org_slug = $1 AND m.status = 'active' AND lower(u.email) = $2
        LIMIT 1
        `,
        [ok.ctx.org.slug, email]
      );

      if ((active.rowCount ?? 0) > 0) {
        await pool.query("UPDATE organization_members SET role=$2, updated_at=NOW() WHERE id=$1", [String(active.rows[0].id), role]);
        return res.json({ ok: true, status: "already_member" });
      }

      // Create or refresh an invite (works for both existing and new accounts).
      const token = randomTokenUrlSafe(32);
      const tokenHash = sha256(token);

      const inviteRow = await pool.query(
        `
        INSERT INTO organization_members (org_slug, invited_email, role, status, invited_at, invite_token_hash, invite_sent_at, invite_expires_at)
        VALUES ($1, $2, $3, 'invited', NOW(), $4, NOW(), NOW() + INTERVAL '14 days')
        ON CONFLICT (org_slug, invited_email)
        DO UPDATE SET role=EXCLUDED.role,
                      status='invited',
                      invited_at=NOW(),
                      invite_token_hash=EXCLUDED.invite_token_hash,
                      invite_sent_at=NOW(),
                      invite_expires_at=EXCLUDED.invite_expires_at,
                      updated_at=NOW()
        RETURNING id
        `,
        [ok.ctx.org.slug, email, role, tokenHash]
      );

      const inviteUrl = `${webBaseUrl()}/org/invite?token=${encodeURIComponent(token)}`;
      const subject = `You're invited to join ${ok.ctx.org.name} on ThankYou`;
      const body = [
        `You've been invited to join ${ok.ctx.org.name} as a ${role}.`,
        ``,
        `Accept invite: ${inviteUrl}`,
        ``,
        `If you already have an individual volunteer/requester account, we recommend using a separate org-team account to keep modes separate.`
      ].join("\n");

      let devInviteUrl: string | null = null;
      try {
        await sendEmail({ to: email, subject, text: body });
      } catch (_e) {
        // Local dev fallback when SMTP isn't configured.
        devInviteUrl = inviteUrl;
      }

      return res.status(201).json({ ok: true, status: "invited", member_id: inviteRow.rows?.[0]?.id, dev_invite_url: devInviteUrl });
    })
  );


  // Cancel a pending invite (admin/manager only)
  app.delete(
    "/v1/org/members/invites/:memberId",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const idParsed = z.string().uuid().safeParse(req.params.memberId);
      if (!idParsed.success) return res.status(400).json({ message: "Invalid member id" });

      await pool.query(
        "DELETE FROM organization_members WHERE id=$1 AND org_slug=$2 AND status='invited'",
        [idParsed.data, ok.ctx.org.slug]
      );

      return res.json({ ok: true });
    })
  );


  // Resend an invite (admin/manager only)
  app.post(
    "/v1/org/members/invites/:memberId/resend",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const idParsed = z.string().uuid().safeParse(req.params.memberId);
      if (!idParsed.success) return res.status(400).json({ message: "Invalid member id" });

      const row = await pool.query(
        `
        SELECT m.id, m.invited_email, m.role
        FROM organization_members m
        WHERE m.id=$1 AND m.org_slug=$2 AND m.status='invited'
        LIMIT 1
        `,
        [idParsed.data, ok.ctx.org.slug]
      );
      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Invite not found" });

      const token = randomTokenUrlSafe(32);
      const tokenHash = sha256(token);
      await pool.query(
        "UPDATE organization_members SET invite_token_hash=$2, invite_sent_at=NOW(), invite_expires_at=NOW() + INTERVAL '14 days', updated_at=NOW() WHERE id=$1",
        [idParsed.data, tokenHash]
      );

      const inviteUrl = `${webBaseUrl()}/org/invite?token=${encodeURIComponent(token)}`;
      const inviteEmail = String(row.rows[0].invited_email || "").trim().toLowerCase();
      const role = String(row.rows[0].role || "member");

      const subject = `Reminder: join ${ok.ctx.org.name} on ThankYou`;
      const body = [
        `You're invited to join ${ok.ctx.org.name} as a ${role}.`,
        ``,
        `Accept invite: ${inviteUrl}`
      ].join("\n");

      let devInviteUrl: string | null = null;
      try {
        await sendEmail({ to: inviteEmail, subject, text: body });
      } catch (_e) {
        devInviteUrl = inviteUrl;
      }

      return res.json({ ok: true, dev_invite_url: devInviteUrl });
    })
  );


  // Public: show invite details for a token (used by /org/invite page).
  app.get(
    "/v1/public/org-invites/lookup",
    wrap(async (req, res) => {
      const token = String(req.query.token || "").trim();
      if (!token) return res.status(400).json({ message: "Missing token" });

      const tokenHash = sha256(token);
      const row = await pool.query(
        `
        SELECT m.org_slug, m.role, m.invited_email, m.invite_expires_at, o.name AS org_name
        FROM organization_members m
        JOIN organizations o ON o.slug = m.org_slug
        WHERE m.status='invited' AND m.invite_token_hash=$1 AND (m.invite_expires_at IS NULL OR m.invite_expires_at > NOW())
        LIMIT 1
        `,
        [tokenHash]
      );
      if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Invite not found" });

      const r = row.rows[0];
      return res.json({
        org: { slug: String(r.org_slug), name: String(r.org_name) },
        role: String(r.role),
        invited_email: r.invited_email ? String(r.invited_email) : null,
        expires_at: r.invite_expires_at ? String(r.invite_expires_at) : null
      });
    })
  );


  // Accept an invite (requires login).
  app.post(
    "/v1/org/invites/accept",
    wrap(async (req, res) => {
      const sessionToken = authHeaderToken(req);
      if (!sessionToken) return res.status(401).json({ message: "Not authenticated" });

      const user = await requireUserBySession(pool, sessionToken);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const schema = z.object({ token: z.string().min(8), adultConfirmed: z.boolean().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const tokenHash = sha256(String(parsed.data.token).trim());

      const invite = await pool.query(
        `
        SELECT m.id, m.org_slug, m.role, m.invited_email, m.invite_expires_at, o.name AS org_name
        FROM organization_members m
        JOIN organizations o ON o.slug = m.org_slug
        WHERE m.status='invited' AND m.invite_token_hash=$1 AND (m.invite_expires_at IS NULL OR m.invite_expires_at > NOW())
        LIMIT 1
        `,
        [tokenHash]
      );
      if ((invite.rowCount ?? 0) === 0) return res.status(404).json({ message: "Invite not found" });

      const inv = invite.rows[0];
      const invitedEmail = String(inv.invited_email || "").trim().toLowerCase();
      const userEmail = String(user.email || "").trim().toLowerCase();
      if (invitedEmail && userEmail !== invitedEmail) {
        return res.status(403).json({ message: "This invite was sent to a different email address." });
      }

      const notAdult = await staffAdultCheck(String(user.id), parsed.data.adultConfirmed);
      if (notAdult) return res.status(403).json({ message: notAdult, code: "adult_required" });

      // One account, multiple roles: volunteers and requesters can also join an organization's team.
      const hasMemberRoles = (user.roles || []).length > 0;

      const c = await pool.connect();
      await c.query("BEGIN");
      try {
        // If user already has membership, update it; otherwise, convert the invite row to the active membership.
        const existing = await c.query(
          "SELECT id FROM organization_members WHERE org_slug=$1 AND user_id=$2 LIMIT 1",
          [String(inv.org_slug), String(user.id)]
        );

        if ((existing.rowCount ?? 0) > 0) {
          await c.query(
            "UPDATE organization_members SET role=$2, status='active', joined_at=COALESCE(joined_at, NOW()), updated_at=NOW() WHERE id=$1",
            [String(existing.rows[0].id), String(inv.role)]
          );
          await c.query("DELETE FROM organization_members WHERE id=$1", [String(inv.id)]);
        } else {
          await c.query(
            `
            UPDATE organization_members
            SET user_id=$2,
                status='active',
                joined_at=COALESCE(joined_at, NOW()),
                invite_accepted_at=NOW(),
                invite_token_hash=NULL,
                invite_sent_at=NULL,
                invite_expires_at=NULL,
                updated_at=NOW()
            WHERE id=$1
            `,
            [String(inv.id), String(user.id)]
          );
        }

        // Accounts that only exist for the org become org-team accounts; others keep their roles.
        if (!hasMemberRoles) await c.query(
          `UPDATE users
             SET role='org_admin',
                 account_type='org_team_member',
                 profile_completed=TRUE,
                 availability_completed=TRUE,
                 onboarding_completed=TRUE,
                 verification_required=FALSE,
                 verification_status='not_required',
                 updated_at=NOW()
           WHERE id=$1`,
          [String(user.id)]
        );

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }

      return res.json({ ok: true, org: { slug: String(inv.org_slug), name: String(inv.org_name) } });
    })
  );


  // Join requests: an admin approves (they become a member) or declines.
  const joinDecision = (decision: "approve" | "decline") =>
      wrap(async (req, res) => {
        const ok = await requireOrg(pool, req, res);
        if (!ok) return;
        if (!requireAdmin(ok.ctx, res)) return;
        const id = z.string().uuid().safeParse(req.params.memberId);
        if (!id.success) return res.status(400).json({ message: "Invalid request id" });
        const row = (await pool.query("SELECT id, user_id FROM organization_members WHERE id = $1 AND org_slug = $2 AND status = 'requested'", [id.data, ok.ctx.org.slug])).rows[0];
        if (!row) return res.status(404).json({ message: "Join request not found" });
        if (decision === "decline") {
          await pool.query("DELETE FROM organization_members WHERE id = $1", [row.id]);
          await notify(String(row.user_id), "request_updates", { title: `${ok.ctx.org.name} declined your request to join`, href: "/org/signup" });
          return res.json({ ok: true, status: "declined" });
        }
        const other = await pool.query("SELECT 1 FROM organization_members WHERE user_id = $1 AND status = 'active' AND org_slug <> $2", [row.user_id, ok.ctx.org.slug]);
        if (other.rowCount) return res.status(409).json({ message: "They already belong to another organization." });
        await pool.query("UPDATE organization_members SET status = 'active', joined_at = NOW(), updated_at = NOW() WHERE id = $1", [row.id]);
        const roles = await pool.query("SELECT 1 FROM user_roles WHERE user_id = $1 LIMIT 1", [row.user_id]);
        if (!roles.rowCount) {
          await pool.query(
            `UPDATE users SET role='org_admin', account_type='org_team_member', profile_completed=TRUE, availability_completed=TRUE,
                    onboarding_completed=TRUE, verification_required=FALSE, verification_status='not_required', updated_at=NOW() WHERE id=$1`,
            [row.user_id]
          );
        }
        await notify(String(row.user_id), "request_updates", { title: `You're on the ${ok.ctx.org.name} team`, href: "/org/dashboard" });
        return res.json({ ok: true, status: "active" });
      });
  app.post("/v1/org/members/requests/:memberId/approve", joinDecision("approve"));
  app.post("/v1/org/members/requests/:memberId/decline", joinDecision("decline"));

app.patch(
    "/v1/org/members/:userId",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdmin(ok.ctx, res)) return;

      const params = z.object({ userId: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid user id" });

      const schema = z.object({ role: z.enum(["admin", "manager", "member", "coordinator"]) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
      if (parsed.data.role === "coordinator" && !(await isSchool(ok.ctx.org.slug))) return res.status(400).json({ message: "Coordinators are for schools" });

      const target = (await pool.query("SELECT role, status FROM organization_members WHERE org_slug=$1 AND user_id=$2", [ok.ctx.org.slug, params.data.userId])).rows[0];
      if (!target || target.status !== "active") return res.status(404).json({ message: "Member not found" });
      // Never leave the organization without an admin.
      if (target.role === "admin" && parsed.data.role !== "admin") {
        const admins = (await pool.query("SELECT COUNT(*)::int AS c FROM organization_members WHERE org_slug=$1 AND role='admin' AND status='active'", [ok.ctx.org.slug])).rows[0].c;
        if (admins <= 1) return res.status(409).json({ message: "This is the only admin. Make someone else an admin first." });
      }
      await pool.query(
        "UPDATE organization_members SET role=$3, updated_at=NOW() WHERE org_slug=$1 AND user_id=$2",
        [ok.ctx.org.slug, params.data.userId, parsed.data.role]
      );

      return res.json({ ok: true });
    })
  );


  app.delete(
    "/v1/org/members/:userId",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdmin(ok.ctx, res)) return;

      const params = z.object({ userId: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid user id" });

      const targetId = params.data.userId;

      const target = (await pool.query("SELECT role, status FROM organization_members WHERE org_slug=$1 AND user_id=$2", [ok.ctx.org.slug, targetId])).rows[0];
      if (!target) return res.status(404).json({ message: "Member not found" });
      // Only removing the last admin is refused; anyone else can be removed (access ends at once).
      if (target.role === "admin" && target.status === "active") {
        const n = Number((await pool.query("SELECT COUNT(*)::int AS c FROM organization_members WHERE org_slug=$1 AND role='admin' AND status='active'", [ok.ctx.org.slug])).rows[0]?.c ?? 0);
        if (n <= 1) return res.status(409).json({ message: "This is the only admin. Make someone else an admin first." });
      }

      await pool.query("DELETE FROM organization_members WHERE org_slug=$1 AND user_id=$2", [ok.ctx.org.slug, targetId]);
      // Their sessions stop acting for this organization.
      await pool.query("UPDATE sessions SET active_context = NULL, active_org_slug = NULL WHERE user_id = $1 AND (active_org_slug = $2 OR active_context = $3)", [targetId, ok.ctx.org.slug, `org:${ok.ctx.org.slug}`]);
      return res.json({ ok: true });
    })
  );
}

/** Coordinators exist only in school organizations (they curate opportunities for students). */
async function isSchool(orgSlug: string) {
  const r = await pool.query("SELECT org_type FROM organizations WHERE slug = $1", [orgSlug]);
  return r.rows[0]?.org_type === "school";
}
