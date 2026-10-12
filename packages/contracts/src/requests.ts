import { z } from "zod";

/** Request fields saved by the posting wizard (all optional so drafts save step by step). */
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
    equipmentNotes: z.string().trim().max(1000).nullable(),
    // Target and unit (REQ-01/05): what the request needs in total, e.g. 40 hours or 200 meals.
    targetValue: z.coerce.number().positive().max(1_000_000).nullable(),
    targetUnit: z.string().trim().toLowerCase().min(1).max(40).nullable(),
    minContribution: z.coerce.number().positive().max(1_000_000).nullable(),
    allowOverfill: z.coerce.boolean(),
    // Volunteers under 18 need a parent or guardian's consent before check-in (FORM-03).
    requiresGuardianConsent: z.coerce.boolean()
  })
  .partial()
  .strict();
export type RequestFieldsInput = z.infer<typeof RequestFields>;

export const RequestStatus = z.enum(["draft", "open", "pending", "filled", "paused", "completed", "canceled"]);
export type RequestStatus = z.infer<typeof RequestStatus>;
export const OwnerEvent = z.enum(["publish", "pause", "resume", "complete", "cancel"]);
export type OwnerEvent = z.infer<typeof OwnerEvent>;

export type Category = {
  slug: string;
  label: string;
  description: string;
  is_sensitive: boolean;
  min_post_tier: "basic" | "trusted";
  min_apply_tier: "basic" | "trusted";
  enabled: boolean;
};

/** GET /v1/requests/:id (owner view). */
export type OwnerRequest = {
  id: string;
  title: string;
  description: string;
  status: RequestStatus;
  review_status: "approved" | "pending_review" | "rejected";
  review_notes: string | null;
  category: string | null;
  required_skills: string[];
  nice_to_have_skills: string[];
  volunteers_needed: number;
  urgency: "low" | "normal" | "high";
  schedule_type: "one_time" | "recurring" | "flexible_window";
  starts_at: string | null;
  ends_at: string | null;
  recurrence_rule: string | null;
  timezone: string | null;
  duration_minutes: number | null;
  apply_by: string | null;
  mode: "in-person" | "remote" | "hybrid";
  public_area: string | null;
  exact_address: string | null;
  accessibility_notes: string | null;
  min_age: number | null;
  requires_background_check: boolean;
  requires_training: boolean;
  requires_waiver: boolean;
  requires_car: boolean;
  equipment_notes: string | null;
  is_sensitive: boolean;
  requester_org_slug: string | null;
  published_at: string | null;
  cancel_reason: string | null;
  removed_reason: string | null;
  created_at: string;
  updated_at: string;
  staffing: { accepted: number; needed: number; waitlisted: number; offered?: number; target?: number | null; unit?: string | null; committed?: number };
  actions: OwnerEvent[];
  target_value?: number | null;
  target_unit?: string | null;
  min_contribution?: number | null;
  allow_overfill?: boolean;
  requires_guardian_consent?: boolean;
  owner_approval?: "pending" | "approved" | "rejected" | null;
  owner_approval_notes?: string | null;
  owner_approved_at?: string | null;
  submitted_by_user_id?: string | null;
  checkin_token?: string | null;
  checkin_url?: string | null;
  progress?: { committed: number; approved: number; waiting_approval: number; approved_hours: number; open_capacity: number | null; committed_not_approved: number | null };
  publish_problems: string[];
  events: { event: string; from_status: string | null; to_status: string; actor_kind: string; reason: string | null; created_at: string }[];
};
