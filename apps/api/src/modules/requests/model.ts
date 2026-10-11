import { z } from "zod";
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

const skills = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")))
  .transform((arr) => Array.from(new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean))).slice(0, 20))
  .pipe(z.array(z.string().max(40)));

const isoDate = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d.toISOString();
  });

/** RRULE subset we accept: weekly on given days, optional COUNT/UNTIL (validated loosely, stored verbatim). */
const rrule = z
  .string()
  .trim()
  .max(200)
  .regex(/^FREQ=(DAILY|WEEKLY|MONTHLY)(;(INTERVAL=\d{1,2}|BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*|COUNT=\d{1,3}|UNTIL=\d{8}(T\d{6}Z)?))*$/, "Use a weekly/daily/monthly RRULE");

const timezone = z
  .string()
  .trim()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone");

/** Every editable field. All optional so drafts can be saved one wizard step at a time. */
export const RequestFields = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(5000),
    category: z.string().trim().min(1).max(40),
    requiredSkills: skills,
    niceToHaveSkills: skills,
    volunteersNeeded: z.coerce.number().int().min(1).max(500),
    urgency: z.enum(["low", "normal", "high"]),
    scheduleType: z.enum(["one_time", "recurring", "flexible_window"]),
    startsAt: isoDate.nullable(),
    endsAt: isoDate.nullable(),
    recurrenceRule: rrule.nullable().or(z.literal("").transform(() => null)),
    timezone,
    durationMinutes: z.coerce.number().int().min(15).max(24 * 60).nullable(),
    applyBy: isoDate.nullable(),
    mode: z.enum(["in-person", "remote", "hybrid"]),
    publicArea: z.string().trim().max(120).nullable(),
    exactAddress: z.string().trim().max(300).nullable(),
    accessibilityNotes: z.string().trim().max(1000).nullable(),
    minAge: z.coerce.number().int().min(13).max(99).nullable(),
    requiresBackgroundCheck: z.coerce.boolean(),
    requiresTraining: z.coerce.boolean(),
    requiresWaiver: z.coerce.boolean(),
    requiresCar: z.coerce.boolean(),
    equipmentNotes: z.string().trim().max(1000).nullable()
  })
  .partial()
  .strict();
export type RequestFieldsInput = z.infer<typeof RequestFields>;

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
  equipmentNotes: "equipment_notes"
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
