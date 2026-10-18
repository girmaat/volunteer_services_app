import { RequestFields, type RequestFieldsInput } from "@volunteer_services_app/contracts";
import type { Pool } from "pg";
import { pool as defaultPool } from "../../lib/db";
import type { PolicyUser } from "../../lib/policy";

export const TIER_RANK = { unverified: 0, basic: 1, trusted: 2 } as const;
export type Tier = keyof typeof TIER_RANK;

export type Category = {
  slug: string;
  label: string;
  description: string;
  is_sensitive: boolean;
  min_post_tier: "basic" | "trusted";
  min_apply_tier: "basic" | "trusted";
  enabled: boolean;
};

export async function listCategories(db: Pool = defaultPool, includeDisabled = false): Promise<Category[]> {
  const r = await db.query(
    `SELECT slug, label, description, is_sensitive, min_post_tier, min_apply_tier, enabled
       FROM request_categories ${includeDisabled ? "" : "WHERE enabled"} ORDER BY sort, label`
  );
  return r.rows as Category[];
}

export async function getCategory(slug: string): Promise<Category | null> {
  const r = await defaultPool.query("SELECT slug, label, description, is_sensitive, min_post_tier, min_apply_tier, enabled FROM request_categories WHERE slug = $1", [slug]);
  return (r.rows[0] as Category) ?? null;
}

// Field schema shared with the web app: packages/contracts/src/requests.ts
export { RequestFields, type RequestFieldsInput };

const COLUMN: Record<keyof RequestFieldsInput, string> = {
  title: "title",
  description: "description",
  category: "category",
  requiredSkills: "required_skills",
  niceToHaveSkills: "nice_to_have_skills",
  volunteersNeeded: "volunteers_needed",
  urgency: "urgency",
  scheduleType: "schedule_type",
  startsAt: "starts_at",
  endsAt: "ends_at",
  recurrenceRule: "recurrence_rule",
  timezone: "timezone",
  durationMinutes: "duration_minutes",
  applyBy: "apply_by",
  mode: "mode",
  publicArea: "public_area",
  exactAddress: "exact_address",
  accessibilityNotes: "accessibility_notes",
  minAge: "min_age",
  requiresBackgroundCheck: "requires_background_check",
  requiresTraining: "requires_training",
  requiresWaiver: "requires_waiver",
  requiresCar: "requires_car",
  equipmentNotes: "equipment_notes",
  targetValue: "target_value",
  targetUnit: "target_unit",
  minContribution: "min_contribution",
  allowOverfill: "allow_overfill",
  requiresGuardianConsent: "requires_guardian_consent"
};

/** SET clause + params for the given fields, starting at $<offset>. Keeps legacy columns in sync. */
export function buildSet(fields: RequestFieldsInput, offset: number) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(fields) as [keyof RequestFieldsInput, unknown][]) {
    if (v === undefined) continue;
    params.push(v);
    sets.push(`${COLUMN[k]} = $${offset + params.length - 1}`);
    // Legacy columns still read by older screens.
    if (k === "publicArea") sets.push(`location_text = COALESCE($${offset + params.length - 1}, '')`);
    if (k === "startsAt") sets.push(`needed_by = $${offset + params.length - 1}`);
    if (k === "requiredSkills") sets.push(`tags = $${offset + params.length - 1}`);
  }
  return { sets, params };
}

/** Cross-field rules that apply to a saved draft. */
export function crossFieldProblems(row: Record<string, any>): string[] {
  const out: string[] = [];
  if (row.starts_at && row.ends_at && new Date(row.ends_at) < new Date(row.starts_at)) out.push("The end time is before the start time");
  if (row.apply_by && row.starts_at && new Date(row.apply_by) > new Date(row.starts_at)) out.push("The apply-by date is after the start");
  if (row.schedule_type === "recurring" && !row.recurrence_rule) out.push("Pick which days it repeats");
  if (row.mode !== "remote" && row.exact_address && !row.public_area) out.push("Add a public area (city or neighborhood) to show instead of the address");
  if (row.target_value != null && !row.target_unit) out.push("Say what the goal is counted in (hours, meals, items…)");
  if (row.min_contribution != null && row.target_value != null && Number(row.min_contribution) > Number(row.target_value)) out.push("The smallest useful offer is bigger than the goal");
  return out;
}

/** The poster's trust tier: a verified organization posts at "trusted". */
export async function posterTier(user: PolicyUser, orgSlug: string | null): Promise<Tier> {
  if (orgSlug) {
    const r = await defaultPool.query("SELECT verification_status FROM organizations WHERE slug = $1", [orgSlug]);
    if (["approved", "verified"].includes(String(r.rows[0]?.verification_status || ""))) return "trusted";
  }
  return (user.trust_tier as Tier) || "unverified";
}

export const meetsTier = (have: Tier, need: Tier) => TIER_RANK[have] >= TIER_RANK[need];
