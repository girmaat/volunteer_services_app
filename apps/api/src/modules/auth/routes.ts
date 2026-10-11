/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { requireUserBySession } from "../../auth/session";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { authHeaderToken, requireAuthedUser } from "../../middleware/auth";
import { getShareModerationSummaryForUser } from "../share/helpers";
import * as authHandlers from "../../auth/handlers";

const {
  signup,
  login,
  verifyEmail,
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

app.get("/v1/auth/verify-email", wrap((req, res) => verifyEmail(pool, req, res)));

app.post("/v1/auth/resend-verification", wrap((req, res) => resendVerification(pool, req, res)));

app.post("/v1/auth/forgot-password", wrap((req, res) => forgotPassword(pool, req, res)));

app.post("/v1/auth/reset-password", wrap((req, res) => resetPassword(pool, req, res)));

app.post("/v1/auth/logout", wrap((req, res) => logout(pool, req, res)));


// Current user
app.get("/v1/me", wrap((req, res) => me(pool, req, res)));



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
      "SELECT full_name, display_name, avatar_url, phone, public_location, location, bio, languages, interaction_styles, availability_windows, help_categories, has_car, can_lift_heavy, stairs_ok, pet_friendly, service_radius_miles, experience, experience_tags, need_categories, need_help_prompt, parking_available, elevator_available, stairs_present, pickup_vs_dropoff, time_flexibility, pets_at_home, smoke_free, accessibility_needs, meet_in_public_first, someone_else_present, mask_preferred, updated_at FROM user_profiles WHERE user_id = $1",
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
