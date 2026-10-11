/**
 * Who may see and apply to a request (Phase 4.2): category trust tiers, background checks,
 * minimum age, car requirement and the apply-by date. Used by discovery (to explain) and by apply (to enforce).
 */
import { pool } from "../../lib/db";
import type { PolicyUser } from "../../lib/policy";
import { meetsTier, type Tier } from "./model";

export type Eligibility = { eligible: boolean; problems: { code: string; message: string }[] };

export async function applyEligibility(user: PolicyUser, requestId: string): Promise<Eligibility & { status?: string; ownerId?: string }> {
  const r = await pool.query(
    `SELECT r.id, r.status, r.review_status, r.removed_at, r.apply_by, r.min_age, r.requires_background_check, r.requires_car,
            r.requester_user_id, r.is_sensitive, c.min_apply_tier, c.label AS category_label,
            p.background_check_status, p.birth_year, p.has_car,
            EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_user_id = r.requester_user_id AND b.blocked_user_id = $2)
                                              OR (b.blocker_user_id = $2 AND b.blocked_user_id = r.requester_user_id)) AS blocked
       FROM service_requests r
       LEFT JOIN request_categories c ON c.slug = r.category
       LEFT JOIN user_profiles p ON p.user_id = $2
      WHERE r.id = $1`,
    [requestId, user.id]
  );
  const row = r.rows[0];
  if (!row) return { eligible: false, problems: [{ code: "not_found", message: "Opportunity not found" }] };
  const problems: Eligibility["problems"] = [];
  const live = ["open", "pending", "filled"].includes(row.status) && row.review_status === "approved" && !row.removed_at;
  if (!live) problems.push({ code: "not_open", message: "This opportunity isn't taking applications" });
  if (String(row.requester_user_id) === user.id) problems.push({ code: "own_request", message: "You can't apply to your own request." });
  if (row.blocked) problems.push({ code: "blocked", message: "You can't apply to this request." });
  if (row.apply_by && new Date(row.apply_by) < new Date()) problems.push({ code: "closed", message: "Applications for this opportunity have closed" });
  const tier = (user.trust_tier as Tier) || "unverified";
  if (row.min_apply_tier && !meetsTier(tier, row.min_apply_tier)) {
    problems.push({ code: "verification_required", message: `“${row.category_label}” opportunities are open to verified volunteers. Submit verification in Settings.` });
  }
  if (row.requires_background_check && row.background_check_status !== "cleared") {
    problems.push({ code: "background_check", message: "This opportunity needs a cleared background check on your profile." });
  }
  if (row.min_age) {
    const age = row.birth_year ? new Date().getFullYear() - Number(row.birth_year) - 1 : null; // conservative: assume birthday not yet reached
    if (age === null) problems.push({ code: "age_unknown", message: `Volunteers must be ${row.min_age}+. Add your birth year to your profile.` });
    else if (age < row.min_age) problems.push({ code: "too_young", message: `Volunteers must be ${row.min_age} or older.` });
  }
  if (row.requires_car && !row.has_car) problems.push({ code: "car_required", message: "This opportunity needs a car. Update your profile if you have one." });
  return { eligible: problems.length === 0, problems, status: row.status, ownerId: String(row.requester_user_id) };
}
