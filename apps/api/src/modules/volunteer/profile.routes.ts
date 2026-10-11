/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { setProfile } from "../../auth/handlers";
import { requireVolunteerUser } from "../../middleware/auth";
import { pool } from "../../lib/db";
import { discoverableSql } from "../requests/lifecycle";
import { recommendedFor } from "./opportunities.routes";
import { wrap } from "../../lib/http";

export function registerVolunteerProfileRoutes(app: Express) {




// Volunteer area: dashboard counts + supporting lists (Step 3.1)
app.get(
  "/v1/volunteer/dashboard",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // One round-trip for all dashboard counters (previously 6 sequential queries).
    const [r, rec] = await Promise.all([pool.query(
      `WITH a AS (
         SELECT COALESCE(remote_ok, TRUE) AS remote_ok, COALESCE(in_person_ok, TRUE) AS in_person_ok
           FROM (SELECT 1) x LEFT JOIN user_availability ua ON ua.user_id = $1
       )
       SELECT
         (SELECT COUNT(*)::int FROM service_requests sr, a
           WHERE ${discoverableSql("sr")} AND NOT sr.is_sensitive
             AND (sr.mode IS NULL
                  OR (a.remote_ok AND sr.mode IN ('remote','hybrid'))
                  OR (a.in_person_ok AND sr.mode IN ('in-person','hybrid')))) AS recommended,
         (SELECT COUNT(*)::int FROM volunteer_saved_requests WHERE user_id = $1) AS saved,
         (SELECT COUNT(*)::int FROM request_applications
           WHERE volunteer_user_id = $1 AND status IN ('pending','accepted')) AS applications,
         (SELECT COUNT(*)::int FROM direct_messages WHERE recipient_user_id = $1 AND read_at IS NULL AND status = 'sent') AS unread,
         (SELECT COUNT(*)::int FROM request_commitments
           WHERE volunteer_user_id = $1 AND start_at > NOW() AND status IN ('scheduled','confirmed')) AS upcoming`,
      [user.id]
    ), recommendedFor(user)]);
    const c = r.rows[0] as Record<string, number>;

    return res.json({
      recommendedOpportunities: c.recommended ?? 0,
      savedOpportunities: c.saved ?? 0,
      applicationsNeedingAction: c.applications ?? 0,
      unreadMessages: c.unread ?? 0,
      upcomingCommitments: c.upcoming ?? 0,
      // Top picks travel with the counters so the dashboard is a single backend call.
      recommended: rec.rows.slice(0, 6),
      recommendedRadiusMiles: rec.radius,
      recommendedLocationLabel: rec.label
    });
  })
);





// Volunteer area: profile (Step 3.15)
app.get(
  "/v1/volunteer/profile",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const prof = await pool.query(
      "SELECT full_name, display_name, avatar_url, phone, public_location, location, bio, languages, interaction_styles, availability_windows, help_categories, has_car, can_lift_heavy, stairs_ok, pet_friendly, service_radius_miles, experience, experience_tags, need_categories, need_help_prompt, parking_available, elevator_available, stairs_present, pickup_vs_dropoff, time_flexibility, pets_at_home, smoke_free, accessibility_needs, meet_in_public_first, someone_else_present, mask_preferred, birth_year, background_check_status, background_check_updated_at, updated_at FROM user_profiles WHERE user_id = $1",
      [user.id]
    );

    return res.json({
      user: { id: user.id, email: user.email, role: user.role, trust_tier: user.trust_tier },
      profile: prof.rows[0] || null
    });
  })
);



app.post(
  "/v1/volunteer/profile",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // Full name is required for volunteer profiles.
    const schema = z.object({ fullName: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Full name is required" });
    }

    // Reuse onboarding profile handler to persist profile fields.
    return setProfile(pool, req, res);
  })
);
}
