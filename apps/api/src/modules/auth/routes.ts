/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { requireUserBySession } from "../../auth/session";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { authHeaderToken, requireAuthedUser } from "../../middleware/auth";
import { getShareModerationSummaryForUser } from "../share/helpers";
import * as authHandlers from "../../auth/handlers";
import { z } from "zod";
import { setSessionContext } from "../../auth/session";
import { homeFor, isValidContext, type PolicyUser } from "../../lib/policy";

const {
  signup,
  login,
  verifyEmail,
  checkVerifyLink,
  resendVerification,
  forgotPassword,
  resetPassword,
  me,
  logout,
  setRole,
  setRequesterMode,
  setProfile,
  setAvailability,
  skipAvailability,
  submitVerification,
  verificationUploadMiddleware
} = authHandlers as any;

export function registerAuthRoutes(app: Express) {

// Auth
app.post("/v1/auth/signup", wrap((req, res) => signup(pool, req, res)));

app.post("/v1/auth/login", wrap((req, res) => login(pool, req, res)));

app.get("/v1/auth/verify-email", wrap((req, res) => checkVerifyLink(pool, req, res)));
app.post("/v1/auth/verify-email", wrap((req, res) => verifyEmail(pool, req, res)));

app.post("/v1/auth/resend-verification", wrap((req, res) => resendVerification(pool, req, res)));

app.post("/v1/auth/forgot-password", wrap((req, res) => forgotPassword(pool, req, res)));

app.post("/v1/auth/reset-password", wrap((req, res) => resetPassword(pool, req, res)));

app.post("/v1/auth/logout", wrap((req, res) => logout(pool, req, res)));

// Signed-in password change (Settings → Account). Keeps this session, ends the others.
app.post("/v1/auth/change-password", wrap((req, res) => authHandlers.changePassword(pool, req, res)));


// Current user
app.get("/v1/me", wrap((req, res) => me(pool, req, res)));



// Active context (volunteer | requester | org:<slug> | admin) for this session.
app.post(
  "/v1/me/context",
  wrap(async (req, res) => {
    const token = authHeaderToken(req);
    const user = await requireAuthedUser(req, res);
    if (!user || !token) return;
    const parsed = z.object({ context: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    const ctx = parsed.data.context;
    if (!isValidContext(user as PolicyUser, ctx)) return res.status(403).json({ message: "You don't have access to that context" });
    await setSessionContext(pool, token, ctx);
    return res.json({ active_context: ctx, home: homeFor(ctx) });
  })
);

// Add a second role (volunteer or requester) to the signed-in account.
app.post(
  "/v1/me/roles",
  wrap(async (req, res) => {
    const token = authHeaderToken(req);
    const user = await requireAuthedUser(req, res);
    if (!user || !token) return;
    const parsed = z.object({ role: z.enum(["volunteer", "requester"]) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    const role = parsed.data.role;
    const added = await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.id, role]);
    await setSessionContext(pool, token, role);
    // Only the profile for the new role is missing; send the user there.
    const next = role === "volunteer" ? "/volunteer/profile?setup=1" : "/requester/profile?setup=1";
    return res.status(added.rowCount ? 201 : 200).json({ role, added: Boolean(added.rowCount), active_context: role, next });
  })
);

app.get("/v1/me/moderation", async (req, res) => {
  const user = await requireAuthedUser(req, res);
  if (!user) return;
  const summary = await getShareModerationSummaryForUser(String((user as any).id));
  return res.json(summary);
});




// Onboarding
// Fetch current (possibly incomplete) profile for onboarding forms.
app.get(
  "/v1/onboarding/profile",
  wrap(async (req, res) => {
    const token = authHeaderToken(req);
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const user = await requireUserBySession(pool, token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const prof = await pool.query(
      "SELECT full_name, display_name, avatar_url, phone, public_location, location, bio, languages, interaction_styles, availability_windows, help_categories, has_car, can_lift_heavy, stairs_ok, pet_friendly, service_radius_miles, experience, experience_tags, need_categories, need_help_prompt, parking_available, elevator_available, stairs_present, pickup_vs_dropoff, time_flexibility, pets_at_home, smoke_free, accessibility_needs, meet_in_public_first, someone_else_present, mask_preferred, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, updated_at FROM user_profiles WHERE user_id = $1",
      [user.id]
    );

    return res.json({ profile: prof.rows[0] || null });
  })
);


app.post("/v1/onboarding/role", wrap((req, res) => setRole(pool, req, res)));

app.post("/v1/onboarding/requester-mode", wrap((req, res) => setRequesterMode(pool, req, res)));

app.post("/v1/onboarding/profile", wrap((req, res) => setProfile(pool, req, res)));

app.post("/v1/onboarding/availability", wrap((req, res) => setAvailability(pool, req, res)));

app.post("/v1/onboarding/availability/skip", wrap((req, res) => skipAvailability(pool, req, res)));

app.post(
  "/v1/onboarding/verification",
  verificationUploadMiddleware,
  wrap((req, res) => submitVerification(pool, req, res))
);
}
