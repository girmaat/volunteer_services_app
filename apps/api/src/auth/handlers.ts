
import { HttpUrl } from "@thankyou/contracts";
import type { Request, Response } from "express";
import type { Pool } from "pg";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import { randomTokenUrlSafe, sha256 } from "./crypto";
import { devEmailLink, sendEmail } from "./email";
import { createSession, deleteSession, deleteAllSessionsForUser, requireUserBySession } from "./session";
import { recomputeOnboarding } from "./onboarding";
import { ensureUserGeo } from "../geo";
import { getAdminFlags } from "../admin/auth";

function webBaseUrl() {
  const url = process.env.WEB_BASE_URL;
  if (!url) throw new Error("WEB_BASE_URL is required");
  return url.replace(/\/$/, "");
}

function authHeaderToken(req: Request) {
  const header = req.header("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export async function me(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  const flags = await getAdminFlags(pool, user as any);
  return res.json({ user: { ...(user as any), is_platform_admin: flags.isPlatformAdmin, is_super_admin: flags.isSuperAdmin, platform_admin_role: flags.platformAdminRole } });
}

export async function signup(pool: Pool, req: Request, res: Response) {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(1).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase().trim();

  const existing = await pool.query("SELECT id, email_verified_at FROM users WHERE email=$1", [email]);
  if ((existing.rowCount ?? 0) > 0) {
    const existingUser = existing.rows[0] as any;
    const existingUserId = String(existingUser.id);
    const verifiedAt = existingUser.email_verified_at as string | null;

    // If the email exists but is not verified, generate a fresh verification token and return it (no SMTP required).
    if (!verifiedAt) {
      const token = randomTokenUrlSafe(32);
      const tokenHash = sha256(token);

      await pool.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [existingUserId]);
      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [existingUserId, tokenHash]
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

      return res.status(202).json({
        status: "accepted",
        needsEmailVerification: true,
        message: "Account exists. Please verify your email to continue.",
        emailDelivery: delivery.delivery,
        dev_verify_url
      });
    }

    return res.status(409).json({ message: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const userRows = await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     RETURNING id`,
    [email, passwordHash]
  );
  const userId = userRows.rows[0].id as string;

  const fullName = String((parsed.data as any).fullName || "").trim();

  if (fullName) {
    await pool.query(
      `INSERT INTO user_profiles (user_id, full_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET full_name=EXCLUDED.full_name, updated_at=NOW()`,
      [userId, fullName]
    );
  } else {
    await pool.query(
      `INSERT INTO user_profiles (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
  }

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
    text: `Verify your email to continue:
${verifyUrl}

If you didn't create this account, you can ignore this email.`
  });

  const dev_verify_url = devEmailLink(verifyUrl, delivery.delivery);

  return res.status(202).json({ status: "accepted", dev_verify_url });
}

export async function resendVerification(pool: Pool, req: Request, res: Response) {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase().trim();

  const u = await pool.query("SELECT id, email_verified_at FROM users WHERE email=$1", [email]);
  if ((u.rowCount ?? 0) === 0) {
    // Do not reveal whether the email exists.
    return res.status(202).json({ status: "accepted" });
  }

  const userId = String((u.rows[0] as any).id);
  const verifiedAt = (u.rows[0] as any).email_verified_at as string | null;

  if (verifiedAt) {
    return res.json({ status: "ok", message: "Email already verified" });
  }

  const token = randomTokenUrlSafe(32);
  const tokenHash = sha256(token);

  await pool.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [userId]);
  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
    [userId, tokenHash]
  );

  const verifyUrl = `${webBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  const delivery = await sendEmail({
    to: email,
    subject: "Verify your ThankYou email",
    text: `Verify your email to continue:
${verifyUrl}

If you didn't request this email, you can ignore it.`
  });

  const dev_verify_url = devEmailLink(verifyUrl, delivery.delivery);

  return res.status(202).json({ status: "accepted", dev_verify_url });
}

export async function verifyEmail(pool: Pool, req: Request, res: Response) {
  const token = String((req.query as any)?.token || "");
  if (!token) return res.status(400).json({ message: "Missing token" });

  const tokenHash = sha256(token);

  const t = await pool.query(
    `SELECT evt.id AS token_id, evt.user_id, evt.expires_at, evt.used_at,
            u.email, u.email_verified_at, u.role, u.profile_completed, u.availability_completed,
            u.verification_required, u.verification_status, u.onboarding_completed, u.created_at, u.updated_at
     FROM email_verification_tokens evt
     JOIN users u ON u.id = evt.user_id
     WHERE evt.token_hash=$1`,
    [tokenHash]
  );

  if ((t.rowCount ?? 0) === 0) return res.status(400).json({ message: "Invalid or expired token" });

  const row = t.rows[0] as any;
  if (row.used_at) return res.status(400).json({ message: "Token already used" });
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  const userId = String(row.user_id);
  const tokenId = String(row.token_id);

  await pool.query("UPDATE users SET email_verified_at=COALESCE(email_verified_at, NOW()), updated_at=NOW() WHERE id=$1", [
    userId
  ]);
  await pool.query("UPDATE email_verification_tokens SET used_at=NOW() WHERE id=$1", [tokenId]);

  await recomputeOnboarding(pool, userId);

  const session = await createSession(pool, userId);
  const user = await requireUserBySession(pool, session.sessionToken);

  return res.json({ status: "ok", sessionToken: session.sessionToken, user });
}

export async function login(pool: Pool, req: Request, res: Response) {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase().trim();
  const password = parsed.data.password;

  const u = await pool.query(
    `SELECT id, email, password_hash, email_verified_at, role, profile_completed, availability_completed,
            verification_required, verification_status, onboarding_completed, created_at, updated_at
     FROM users WHERE email=$1`,
    [email]
  );
  if ((u.rowCount ?? 0) === 0) return res.status(401).json({ message: "Invalid email or password" });

  const row = u.rows[0] as any;
  const ok = await bcrypt.compare(password, String(row.password_hash || ""));
  if (!ok) return res.status(401).json({ message: "Invalid email or password" });

  if (!row.email_verified_at) {
    return res.status(403).json({ message: "Please verify your email to log in" });
  }

  const session = await createSession(pool, String(row.id));
  const user = await requireUserBySession(pool, session.sessionToken);

  return res.json({ sessionToken: session.sessionToken, user });
}

export async function logout(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (token) {
    await deleteSession(pool, token);
  }
  return res.json({ ok: true });
}

export async function changePassword(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const u = await pool.query("SELECT password_hash FROM users WHERE id=$1", [user.id]);
  if ((u.rowCount ?? 0) === 0) return res.status(401).json({ message: "Not authenticated" });

  const passwordHash = String((u.rows[0] as any).password_hash || "");
  const ok = await bcrypt.compare(parsed.data.currentPassword, passwordHash);
  if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

  const same = await bcrypt.compare(parsed.data.newPassword, passwordHash);
  if (same) return res.status(400).json({ message: "New password must be different from current password" });

  const nextHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await pool.query("BEGIN");
  try {
    await pool.query("UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1", [user.id, nextHash]);
    // Keep the current session, sign out everywhere else.
    await pool.query("DELETE FROM sessions WHERE user_id=$1 AND session_token <> $2::uuid", [user.id, token]);
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }

  return res.json({ status: "password_changed", signedOutOtherSessions: true });
}


export async function forgotPassword(pool: Pool, req: Request, res: Response) {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const email = parsed.data.email.toLowerCase().trim();

  const u = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
  if ((u.rowCount ?? 0) === 0) {
    // Do not reveal whether the email exists.
    return res.status(202).json({ status: "accepted" });
  }

  const userId = String((u.rows[0] as any).id);

  const token = randomTokenUrlSafe(32);
  const tokenHash = sha256(token);

  await pool.query("DELETE FROM password_reset_tokens WHERE user_id=$1", [userId]);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
    [userId, tokenHash]
  );

  const resetUrl = `${webBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  const delivery = await sendEmail({
    to: email,
    subject: "Reset your ThankYou password",
    text: `Reset your password using the link below:
${resetUrl}

If you didn't request this, you can ignore this email.`
  });

  const dev_reset_url = devEmailLink(resetUrl, delivery.delivery);

  return res.status(202).json({ status: "accepted", dev_reset_url });
}

export async function resetPassword(pool: Pool, req: Request, res: Response) {
  const schema = z.object({ token: z.string().min(10), password: z.string().min(8) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const tokenHash = sha256(parsed.data.token);

  const t = await pool.query(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash=$1`,
    [tokenHash]
  );
  if ((t.rowCount ?? 0) === 0) return res.status(400).json({ message: "Invalid or expired token" });

  const row = t.rows[0];
  if (row.used_at) return res.status(400).json({ message: "Token already used" });

  const expiresAt = new Date(row.expires_at);
  if (expiresAt.getTime() < Date.now()) return res.status(400).json({ message: "Token expired" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await pool.query("BEGIN");
  try {
    await pool.query("UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1", [row.user_id, passwordHash]);
    await pool.query("UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1", [row.id]);
    await deleteAllSessionsForUser(pool, row.user_id);
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }

  return res.json({ status: "password_reset" });
}

export async function setRole(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  const schema = z.object({ role: z.enum(["volunteer", "requester"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const role = parsed.data.role;
  const verificationRequired = false;
  const verificationStatus: any = "not_required";

  const accountType = role === "volunteer" ? "volunteer" : "individual_requester";

  await pool.query(
    `UPDATE users SET role=$2, account_type=$3, verification_required=$4, verification_status=$5, updated_at=NOW() WHERE id=$1`,
    [user.id, role, accountType, verificationRequired, verificationStatus]
  );

  await recomputeOnboarding(pool, user.id);

  const updated = await requireUserBySession(pool, token);
  return res.json({ user: updated });
}

// Sets requester mode after the user picked "individual requester" vs "org requester".
// - mode=individual  => account_type=individual_requester
// - mode=organization => account_type=org_requester
export async function setRequesterMode(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  if (user.role !== "requester") {
    return res.status(400).json({ message: "Requester mode can only be set for requester accounts" });
  }

  const schema = z.object({ mode: z.enum(["individual", "organization"]) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const mode = parsed.data.mode;
  const accountType = mode === "organization" ? "org_requester" : "individual_requester";

  await pool.query(
    `UPDATE users SET requester_mode=$2, account_type=$3, updated_at=NOW() WHERE id=$1`,
    [user.id, mode, accountType]
  );

  await recomputeOnboarding(pool, user.id);

  const updated = await requireUserBySession(pool, token);
  return res.json({ user: updated });
}

export async function setProfile(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  let locationTouched = false;

  const schema = z.object({
    // Account identity (private)
    fullName: z.string().min(1).optional().nullable(),
    phone: z.string().optional().nullable(),

    // Public profile (shown to others)
    displayName: z.string().optional().nullable(),
    avatarUrl: HttpUrl.optional().nullable(),
    publicLocation: z.string().optional().nullable(),

    // Legacy field (pre-public_location). Kept for backward compatibility.
    location: z.string().optional().nullable(),

    bio: z.string().optional().nullable(),
    languages: z.array(z.string().min(1)).optional().nullable(),
    interactionStyles: z.array(z.string().min(1)).optional().nullable(),

    // Broad availability labels shown before chat (weekdays/evenings/weekends)
    availabilityWindows: z.array(z.string().min(1)).optional().nullable(),

    // Volunteer-specific (public/safety-safe)
    helpCategories: z.array(z.string().min(1)).optional().nullable(),
    hasCar: z.boolean().optional().nullable(),
    canLiftHeavy: z.boolean().optional().nullable(),
    stairsOk: z.boolean().optional().nullable(),
    petFriendly: z.boolean().optional().nullable(),
    serviceRadiusMiles: z.number().int().positive().optional().nullable(),
    experience: z.string().optional().nullable(),
    experienceTags: z.array(z.string().min(1)).optional().nullable(),

    // Requester-specific (public)
    needCategories: z.array(z.string().min(1)).optional().nullable(),
    needHelpPrompt: z.string().optional().nullable(),

    parkingAvailable: z.boolean().optional().nullable(),
    elevatorAvailable: z.boolean().optional().nullable(),
    stairsPresent: z.boolean().optional().nullable(),
    pickupVsDropoff: z.enum(["pickup", "dropoff", "either"]).optional().nullable(),
    timeFlexibility: z.enum(["low", "medium", "high"]).optional().nullable(),

    petsAtHome: z.boolean().optional().nullable(),
    smokeFree: z.boolean().optional().nullable(),
    accessibilityNeeds: z.string().optional().nullable(),

    meetInPublicFirst: z.boolean().optional().nullable(),
    someoneElsePresent: z.boolean().optional().nullable(),
    maskPreferred: z.boolean().optional().nullable()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const d = parsed.data;

  // Ensure a profile row exists.
  await pool.query(
    `INSERT INTO user_profiles (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  );

  // Build a partial update so callers can either:
  // - omit a field to keep existing value, or
  // - send null to explicitly clear it.
  const body: any = req.body || {};
  const setClauses: string[] = [];
  const params: any[] = [user.id];

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const add = (column: string, value: any, cast?: string) => {
    params.push(value);
    const idx = params.length;
    setClauses.push(`${column}=$${idx}${cast ? `::${cast}` : ""}`);
  };

  // Account identity (private)
  if (has("fullName")) add("full_name", d.fullName ?? null);
  if (has("phone")) add("phone", d.phone ?? null);

  // Public profile
  if (has("displayName")) add("display_name", d.displayName ?? null);
  if (has("avatarUrl")) add("avatar_url", d.avatarUrl ?? null);
  if (has("publicLocation")) {
    locationTouched = true;
    add("public_location", d.publicLocation ?? null);
  }
  if (has("location")) {
    locationTouched = true;
    add("location", d.location ?? null);
  }
  if (locationTouched) {
    // Force re-geocode from the updated label (public_location/location).
    add("geo_lat", null);
    add("geo_lng", null);
    add("geo_updated_at", null);
  }
  if (has("bio")) add("bio", d.bio ?? null);

  // Arrays: treat null as empty array
  if (has("languages")) add("languages", d.languages ?? [], "text[]");
  if (has("interactionStyles")) add("interaction_styles", d.interactionStyles ?? [], "text[]");
  if (has("availabilityWindows")) add("availability_windows", d.availabilityWindows ?? [], "text[]");

  // Volunteer-specific
  if (has("helpCategories")) add("help_categories", d.helpCategories ?? [], "text[]");
  if (has("hasCar")) add("has_car", d.hasCar ?? null);
  if (has("canLiftHeavy")) add("can_lift_heavy", d.canLiftHeavy ?? null);
  if (has("stairsOk")) add("stairs_ok", d.stairsOk ?? null);
  if (has("petFriendly")) add("pet_friendly", d.petFriendly ?? null);
  if (has("serviceRadiusMiles")) add("service_radius_miles", d.serviceRadiusMiles ?? null);
  if (has("experience")) add("experience", d.experience ?? null);
  if (has("experienceTags")) add("experience_tags", d.experienceTags ?? [], "text[]");

  // Requester-specific
  if (has("needCategories")) add("need_categories", d.needCategories ?? [], "text[]");
  if (has("needHelpPrompt")) add("need_help_prompt", d.needHelpPrompt ?? null);

  if (has("parkingAvailable")) add("parking_available", d.parkingAvailable ?? null);
  if (has("elevatorAvailable")) add("elevator_available", d.elevatorAvailable ?? null);
  if (has("stairsPresent")) add("stairs_present", d.stairsPresent ?? null);
  if (has("pickupVsDropoff")) add("pickup_vs_dropoff", d.pickupVsDropoff ?? null);
  if (has("timeFlexibility")) add("time_flexibility", d.timeFlexibility ?? null);

  if (has("petsAtHome")) add("pets_at_home", d.petsAtHome ?? null);
  if (has("smokeFree")) add("smoke_free", d.smokeFree ?? null);
  if (has("accessibilityNeeds")) add("accessibility_needs", d.accessibilityNeeds ?? null);

  if (has("meetInPublicFirst")) add("meet_in_public_first", d.meetInPublicFirst ?? null);
  if (has("someoneElsePresent")) add("someone_else_present", d.someoneElsePresent ?? null);
  if (has("maskPreferred")) add("mask_preferred", d.maskPreferred ?? null);

  if (setClauses.length > 0) {
    await pool.query(
      `UPDATE user_profiles
       SET ${setClauses.join(", ")}, updated_at=NOW()
       WHERE user_id=$1`,
      params
    );
  }

  // Derive coarse geo coords (used for Nearby + recommendations).
  // Stored as lat/lng only; we never expose exact addresses in UI.

  if (locationTouched) {
    // Best-effort geocode: powers Nearby filtering.
    await ensureUserGeo(pool, user.id).catch(() => null);
  }

  await pool.query(
    `UPDATE users SET profile_completed=TRUE, updated_at=NOW() WHERE id=$1`,
    [user.id]
  );

  await recomputeOnboarding(pool, user.id);

  const updated = await requireUserBySession(pool, token);
  return res.json({ user: updated });
}


export async function setAvailability(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  const schema = z.object({
    timezone: z.string().min(1),
    days: z.array(z.string().min(1)).min(1),
    hoursPerWeek: z.number().int().min(1).max(80),
    remoteOk: z.boolean(),
    inPersonOk: z.boolean()
  }).refine((v) => v.remoteOk || v.inPersonOk, { message: "Choose at least one mode" });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  await pool.query(
    `INSERT INTO user_availability (user_id, timezone, days, hours_per_week, remote_ok, in_person_ok)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       timezone=EXCLUDED.timezone,
       days=EXCLUDED.days,
       hours_per_week=EXCLUDED.hours_per_week,
       remote_ok=EXCLUDED.remote_ok,
       in_person_ok=EXCLUDED.in_person_ok,
       updated_at=NOW()`,
    [user.id, parsed.data.timezone, parsed.data.days, parsed.data.hoursPerWeek, parsed.data.remoteOk, parsed.data.inPersonOk]
  );

  await pool.query("UPDATE users SET availability_completed=TRUE, updated_at=NOW() WHERE id=$1", [user.id]);
  await recomputeOnboarding(pool, user.id);

  const updated = await requireUserBySession(pool, token);
  return res.json({ user: updated });
}

export async function skipAvailability(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  const role = String(user.role || "");
  const requesterMode = String((user as any).requester_mode || "");
  const accountType = String((user as any).account_type || "");

  const isIndividualRequester =
    role === "requester" &&
    (requesterMode === "individual" || (!requesterMode && accountType === "individual_requester"));

  if (!isIndividualRequester) {
    res.status(400).json({ message: "Skip availability is only supported for individual requesters." });
    return;
  }

  await pool.query(
    `UPDATE users SET availability_completed=TRUE, updated_at=NOW() WHERE id=$1`,
    [user.id]
  );

  await recomputeOnboarding(pool, user.id);

  res.json({ ok: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const verificationUploadMiddleware = upload.single("document");

export async function submitVerification(pool: Pool, req: Request, res: Response) {
  const token = authHeaderToken(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const user = await requireUserBySession(pool, token);
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  if (!user.verification_required) {
    return res.status(400).json({ message: "Verification is not required for this account" });
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ message: "Missing document file" });

  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  if (!allowed.includes(file.mimetype)) {
    return res.status(400).json({ message: "Unsupported file type. Use PDF, JPG, or PNG." });
  }

  await pool.query(
    `INSERT INTO verification_documents (user_id, file_name, mime_type, bytes)
     VALUES ($1, $2, $3, $4)`,
    [user.id, file.originalname, file.mimetype, file.buffer]
  );

  await pool.query(
    `UPDATE users
        SET verification_status='submitted',
            verification_submitted_at = COALESCE(verification_submitted_at, NOW()),
            updated_at=NOW()
      WHERE id=$1`,
    [user.id]
  );

  await pool.query(`UPDATE users SET verification_submitted_at = COALESCE(verification_submitted_at, NOW()) WHERE id=$1`, [user.id]);

  await recomputeOnboarding(pool, user.id);

  const updated = await requireUserBySession(pool, token);
  return res.json({ user: updated });
}
