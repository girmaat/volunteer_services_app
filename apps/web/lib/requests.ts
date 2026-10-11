import "server-only";
import { backendFetch } from "../app/lib/backend";

export type Category = { slug: string; label: string; description: string; is_sensitive: boolean; min_post_tier: string; min_apply_tier: string; enabled: boolean };

export type OwnerRequest = {
  id: string;
  title: string;
  description: string;
  status: "draft" | "open" | "pending" | "filled" | "paused" | "completed" | "canceled";
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
  staffing: { accepted: number; needed: number; waitlisted: number };
  actions: ("publish" | "pause" | "resume" | "complete" | "cancel")[];
  publish_problems: string[];
  events: { event: string; from_status: string | null; to_status: string; actor_kind: string; reason: string | null; created_at: string }[];
};

export async function getCategories(): Promise<Category[]> {
  const r = await backendFetch("/v1/public/categories");
  if (!r.ok) return [];
  return ((await r.json()) as { categories: Category[] }).categories;
}

export async function getOwnerRequest(id: string): Promise<OwnerRequest | null> {
  const r = await backendFetch(`/v1/requests/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  return (await r.json()) as OwnerRequest;
}

export const STATUS_HELP: Record<string, string> = {
  draft: "Only you can see this draft.",
  open: "Live. Volunteers can find it and apply.",
  pending: "Some spots are filled; still taking applicants.",
  filled: "Every spot is filled. New applicants join the waitlist.",
  paused: "Hidden from search while paused.",
  completed: "Done. Reviews open for 14 days.",
  canceled: "Canceled. Applicants were told."
};
