/**
 * Who may see and apply to a request (Phase 4.2): category trust tiers, background checks,
 * minimum age, car requirement and the apply-by date. Used by discovery (to explain) and by apply (to enforce).
 */
import { pool } from "../../lib/db";
import type { PolicyUser } from "../../lib/policy";
import { meetsTier, type Tier } from "./model";
import { ADULT_AGE, ageOn } from "../../lib/age";
import { prerequisites } from "../prerequisites/service";

export type Eligibility = { eligible: boolean; problems: { code: string; message: string }[] };

export async function applyEligibility(user: PolicyUser, requestId: string): Promise<Eligibility & { status?: string; ownerId?: string }> {
  const r = await pool.query(
    `SELECT r.id, r.status, r.review_status, r.removed_at, r.apply_by, r.min_age, r.requires_background_check, r.requires_car,
            r.requester_user_id, r.requester_org_slug, r.is_sensitive, r.starts_at, c.min_apply_tier, c.label AS category_label,
            p.background_check_status, to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date, p.has_car,
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
  // Age (ID-01, SAFE-01): a birth date is needed before applying; limits apply on the day of the work.
  const age = ageOn(row.birth_date, row.starts_at && new Date(row.starts_at) > new Date() ? new Date(row.starts_at) : new Date());
  if (age === null) problems.push({ code: "age_unknown", message: "Add your date of birth to your profile before applying." });
  else {
    if (row.min_age && age < row.min_age) problems.push({ code: "too_young", message: `This opportunity is for volunteers ${row.min_age} and older.` });
    // Minors only work with organizations, whose staff share and oversee the conversation (SAFE-04).
    if (age < ADULT_AGE && !row.requester_org_slug) {
      problems.push({ code: "adult_only", message: "Requests from individuals are open to volunteers 18 and older. Look for opportunities from organizations." });
    }
  }
  // Forms the organization wants signed before anyone applies (FORM-01).
  if (row.requester_org_slug) {
    const pre = await prerequisites(user.id, requestId);
    const unsigned = pre.items.filter((i) => i.kind === "document" && i.required_before === "apply" && i.state !== "done");
    if (unsigned.length) problems.push({ code: "sign_first", message: `Sign ${unsigned.map((i) => `“${i.label.replace(/^(Form|Training): /, "")}”`).join(" and ")} before applying.` });
  }
  if (row.requires_car && !row.has_car) problems.push({ code: "car_required", message: "This opportunity needs a car. Update your profile if you have one." });
  return { eligible: problems.length === 0, problems, status: row.status, ownerId: String(row.requester_user_id) };
}
