/**
 * Two-step sign-in (SAFE-05). Anyone can turn it on in Settings → Account; platform staff must when
 * MFA_REQUIRED_FOR_STAFF is on (default in production), and organization admins and managers are
 * prompted to. Sign-in with it on: password → short-lived challenge → 6-digit code (or a one-time
 * recovery code) → session.
 */
import type { Express } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomTokenUrlSafe, sha256 } from "../../auth/crypto";
import { createSession, requireUserBySession } from "../../auth/session";
import { pool } from "../../lib/db";
import { mfaKey } from "../../lib/env";
import { wrap } from "../../lib/http";
import { hashRecovery, newSecret, openSecret, otpauthUrl, recoveryCodes, sealSecret, verifyTotp } from "../../lib/totp";
import { requireAuthedUser } from "../../middleware/auth";

const CHALLENGE_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/** After the password checks out: a challenge token when two-step is on, else null. */
export async function startMfaChallenge(userId: string): Promise<string | null> {
  const r = await pool.query("SELECT mfa_enabled_at FROM users WHERE id = $1", [userId]);
  if (!r.rows[0]?.mfa_enabled_at) return null;
  const token = randomTokenUrlSafe(32);
  await pool.query(`INSERT INTO mfa_challenges (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${CHALLENGE_MINUTES} minutes')`, [userId, sha256(token)]);
  return token;
}

/** True when the code is a current TOTP code (not replayed) or an unused recovery code; consumes it. */
async function checkCode(userId: string, code: string): Promise<"totp" | "recovery" | null> {
  const u = (await pool.query("SELECT mfa_secret, mfa_last_step, mfa_recovery_hashes FROM users WHERE id = $1", [userId])).rows[0];
  if (!u?.mfa_secret) return null;
  const secret = openSecret(String(u.mfa_secret), mfaKey());
  if (!secret) return null;
  const step = verifyTotp(secret, code, u.mfa_last_step == null ? null : Number(u.mfa_last_step));
  if (step != null) {
    // Only one sign-in per code: the step is remembered (conditional update guards against a race).
    const up = await pool.query("UPDATE users SET mfa_last_step = $2 WHERE id = $1 AND (mfa_last_step IS NULL OR mfa_last_step < $2)", [userId, step]);
    return up.rowCount ? "totp" : null;
  }
  const h = hashRecovery(code);
  const used = await pool.query("UPDATE users SET mfa_recovery_hashes = array_remove(mfa_recovery_hashes, $2) WHERE id = $1 AND $2 = ANY(mfa_recovery_hashes) RETURNING cardinality(mfa_recovery_hashes) AS left", [userId, h]);
  return used.rowCount ? "recovery" : null;
}

export function registerMfaRoutes(app: Express) {
  // Second step of sign-in.
  app.post(
    "/v1/auth/mfa",
    wrap(async (req, res) => {
      const b = z.object({ mfaToken: z.string().min(20).max(200), code: z.string().trim().min(6).max(20) }).safeParse(req.body ?? {});
      if (!b.success) return res.status(400).json({ message: "Enter the 6-digit code from your authenticator app" });
      const c = (
        await pool.query("SELECT id, user_id, attempts, expires_at, used_at FROM mfa_challenges WHERE token_hash = $1", [sha256(b.data.mfaToken)])
      ).rows[0];
      if (!c || c.used_at || new Date(c.expires_at) < new Date() || c.attempts >= MAX_ATTEMPTS) {
        return res.status(401).json({ error: { code: "mfa_expired", message: "That sign-in expired. Enter your password again." }, message: "That sign-in expired. Enter your password again." });
      }
      await pool.query("UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = $1", [c.id]);
      const how = await checkCode(String(c.user_id), b.data.code);
      if (!how) {
        const left = MAX_ATTEMPTS - Number(c.attempts) - 1;
        const message = left > 0 ? "That code didn't work. Check your app and try again." : "Too many tries. Enter your password again.";
        return res.status(401).json({ error: { code: left > 0 ? "mfa_invalid" : "mfa_expired", message }, message });
      }
      const done = await pool.query("UPDATE mfa_challenges SET used_at = NOW() WHERE id = $1 AND used_at IS NULL", [c.id]);
      if (!done.rowCount) return res.status(401).json({ error: { code: "mfa_expired", message: "That sign-in expired. Enter your password again." }, message: "That sign-in expired. Enter your password again." });
      const session = await createSession(pool, String(c.user_id));
      const user = await requireUserBySession(pool, session.sessionToken);
      const left = how === "recovery" ? Number((await pool.query("SELECT cardinality(mfa_recovery_hashes) AS n FROM users WHERE id = $1", [c.user_id])).rows[0]?.n ?? 0) : null;
      return res.json({ sessionToken: session.sessionToken, user, used_recovery_code: how === "recovery", recovery_codes_left: left });
    })
  );

  app.get(
    "/v1/me/mfa",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const r = (await pool.query("SELECT mfa_enabled_at, cardinality(mfa_recovery_hashes) AS codes FROM users WHERE id = $1", [user.id])).rows[0];
      return res.json({ enabled: Boolean(r?.mfa_enabled_at), enabled_at: r?.mfa_enabled_at ?? null, recovery_codes_left: Number(r?.codes ?? 0) });
    })
  );

  // Step 1 of turning it on: a new secret to scan. Nothing changes until a code from it is confirmed.
  app.post(
    "/v1/me/mfa/setup",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const b = z.object({ password: z.string().min(1) }).safeParse(req.body ?? {});
      if (!b.success) return res.status(400).json({ message: "Enter your password" });
      const row = (await pool.query("SELECT email, password_hash, mfa_enabled_at FROM users WHERE id = $1", [user.id])).rows[0];
      if (!row?.password_hash || !(await bcrypt.compare(b.data.password, row.password_hash))) return res.status(403).json({ message: "That password isn't right" });
      if (row.mfa_enabled_at) return res.status(409).json({ message: "Two-step sign-in is already on" });
      const secret = newSecret();
      await pool.query("UPDATE users SET mfa_pending_secret = $2 WHERE id = $1", [user.id, sealSecret(secret, mfaKey())]);
      return res.json({ secret, otpauth_url: otpauthUrl(secret, String(row.email)) });
    })
  );

  // Step 2: confirm a code, turn it on, show recovery codes once, and sign out other devices.
  app.post(
    "/v1/me/mfa/enable",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const b = z.object({ code: z.string().trim().min(6).max(10) }).safeParse(req.body ?? {});
      if (!b.success) return res.status(400).json({ message: "Enter the 6-digit code from your authenticator app" });
      const row = (await pool.query("SELECT mfa_pending_secret, mfa_enabled_at FROM users WHERE id = $1", [user.id])).rows[0];
      if (row?.mfa_enabled_at) return res.status(409).json({ message: "Two-step sign-in is already on" });
      const secret = row?.mfa_pending_secret ? openSecret(String(row.mfa_pending_secret), mfaKey()) : null;
      if (!secret) return res.status(409).json({ message: "Start setup again" });
      const step = verifyTotp(secret, b.data.code);
      if (step == null) return res.status(422).json({ error: { code: "mfa_invalid", message: "That code didn't work. Check the time on your phone and try again." }, message: "That code didn't work. Check the time on your phone and try again." });
      const codes = recoveryCodes();
      await pool.query(
        `UPDATE users SET mfa_secret = mfa_pending_secret, mfa_pending_secret = NULL, mfa_enabled_at = NOW(), mfa_last_step = $2, mfa_recovery_hashes = $3, updated_at = NOW() WHERE id = $1`,
        [user.id, step, codes.map(hashRecovery)]
      );
      const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      await pool.query("DELETE FROM sessions WHERE user_id = $1 AND session_token::text <> $2", [user.id, token]);
      return res.json({ enabled: true, recovery_codes: codes });
    })
  );

  app.post(
    "/v1/me/mfa/disable",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      const b = z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(20) }).safeParse(req.body ?? {});
      if (!b.success) return res.status(400).json({ message: "Enter your password and a code" });
      const row = (await pool.query("SELECT password_hash, mfa_enabled_at FROM users WHERE id = $1", [user.id])).rows[0];
      if (!row?.mfa_enabled_at) return res.status(409).json({ message: "Two-step sign-in is off" });
      if (!row.password_hash || !(await bcrypt.compare(b.data.password, row.password_hash))) return res.status(403).json({ message: "That password isn't right" });
      if (!(await checkCode(user.id, b.data.code))) return res.status(422).json({ error: { code: "mfa_invalid", message: "That code didn't work" }, message: "That code didn't work" });
      await pool.query("UPDATE users SET mfa_secret = NULL, mfa_pending_secret = NULL, mfa_enabled_at = NULL, mfa_last_step = NULL, mfa_recovery_hashes = '{}', updated_at = NOW() WHERE id = $1", [user.id]);
      return res.json({ enabled: false });
    })
  );
}
