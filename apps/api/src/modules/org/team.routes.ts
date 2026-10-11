/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { randomTokenUrlSafe, sha256 } from "../../auth/crypto";
import { sendEmail } from "../../auth/email";
import { requireUserBySession } from "../../auth/session";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { authHeaderToken, requireAdmin, requireAdminOrManager, requireOrg, webBaseUrl } from "./context";

export function registerOrgTeamRoutes(app: Express) {



  // Phase 1/4: Members (existing UI uses these; kept)
  app.get(
    "/v1/org/members",
    wrap(async (req: any, res: any) => {
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
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdminOrManager(ok.ctx, res)) return;

      const schema = z.object({
        email: z.string().email(),
        role: z.enum(["member", "manager", "admin"]).optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const email = String(parsed.data.email || "").trim().toLowerCase();
      const role = (parsed.data.role || "member") as any;

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
    wrap(async (req: any, res: any) => {
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
    wrap(async (req: any, res: any) => {
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
    wrap(async (req: any, res: any) => {
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

      const r = row.rows[0] as any;
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
    wrap(async (req: any, res: any) => {
      const sessionToken = authHeaderToken(req);
      if (!sessionToken) return res.status(401).json({ message: "Not authenticated" });

      const user = await requireUserBySession(pool, sessionToken);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      const schema = z.object({ token: z.string().min(8) });
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

      const inv = invite.rows[0] as any;
      const invitedEmail = String(inv.invited_email || "").trim().toLowerCase();
      const userEmail = String((user as any).email || "").trim().toLowerCase();
      if (invitedEmail && userEmail !== invitedEmail) {
        return res.status(403).json({ message: "This invite was sent to a different email address." });
      }

      // One account, multiple roles: volunteers and requesters can also join an organization's team.
      const hasMemberRoles = ((user as any).roles || []).length > 0;

      await pool.query("BEGIN");
      try {
        // If user already has membership, update it; otherwise, convert the invite row to the active membership.
        const existing = await pool.query(
          "SELECT id FROM organization_members WHERE org_slug=$1 AND user_id=$2 LIMIT 1",
          [String(inv.org_slug), String((user as any).id)]
        );

        if ((existing.rowCount ?? 0) > 0) {
          await pool.query(
            "UPDATE organization_members SET role=$2, status='active', joined_at=COALESCE(joined_at, NOW()), updated_at=NOW() WHERE id=$1",
            [String(existing.rows[0].id), String(inv.role)]
          );
          await pool.query("DELETE FROM organization_members WHERE id=$1", [String(inv.id)]);
        } else {
          await pool.query(
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
            [String(inv.id), String((user as any).id)]
          );
        }

        // Accounts that only exist for the org become org-team accounts; others keep their roles.
        if (!hasMemberRoles) await pool.query(
          `UPDATE users
             SET role='org_admin',
                 account_type='org_team_member',
                 onboarding_completed=TRUE,
                 verification_required=TRUE,
                 verification_status='required',
                 updated_at=NOW()
           WHERE id=$1`,
          [String((user as any).id)]
        );

        await pool.query("COMMIT");
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }

      return res.json({ ok: true, org: { slug: String(inv.org_slug), name: String(inv.org_name) } });
    })
  );


app.patch(
    "/v1/org/members/:userId",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdmin(ok.ctx, res)) return;

      const params = z.object({ userId: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid user id" });

      const schema = z.object({ role: z.enum(["admin", "manager", "member"]) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      await pool.query(
        "UPDATE organization_members SET role=$3, updated_at=NOW() WHERE org_slug=$1 AND user_id=$2",
        [ok.ctx.org.slug, params.data.userId, parsed.data.role]
      );

      return res.json({ ok: true });
    })
  );


  app.delete(
    "/v1/org/members/:userId",
    wrap(async (req: any, res: any) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (!requireAdmin(ok.ctx, res)) return;

      const params = z.object({ userId: z.string().uuid() }).safeParse(req.params);
      if (!params.success) return res.status(400).json({ message: "Invalid user id" });

      const targetId = params.data.userId;

      // Prevent removing last admin
      const admins = await pool.query(
        "SELECT COUNT(*)::int AS c FROM organization_members WHERE org_slug=$1 AND role='admin' AND status='active'",
        [ok.ctx.org.slug]
      );
      const n = Number(admins.rows[0]?.c ?? 0);
      if (n <= 1) return res.status(409).json({ message: "You are the last admin; add another admin first." });

      await pool.query("DELETE FROM organization_members WHERE org_slug=$1 AND user_id=$2", [ok.ctx.org.slug, targetId]);
      return res.json({ ok: true });
    })
  );
}
