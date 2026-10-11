import "server-only";

import { API_BASE_URL_SERVER } from "@thankyou/config";
import { cookies } from "next/headers";
import { cache } from "react";
import { forwardHeaders } from "../../lib/forward";

export type CurrentUser = {
  id: string;
  email: string;
  email_verified_at: string | null;
  role: "volunteer" | "requester" | "org_admin" | null;
  account_type: "volunteer" | "requester_unset" | "individual_requester" | "requester_org" | "org_team_member" | null;
  profile_completed: boolean;
  availability_completed: boolean;
  verification_required: boolean;
  verification_status: "not_required" | "required" | "submitted" | "approved" | "rejected";
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;

  // One account, multiple roles (Phase 4.1)
  roles?: ("volunteer" | "requester")[];
  orgs?: { slug: string; name: string; role: "admin" | "manager" | "member" }[];
  contexts?: string[];
  active_context?: string | null;
  home?: string;
  trust_tier?: "unverified" | "basic" | "trusted";
  platform_role?: "moderator" | "admin" | "super" | null;
  unread_notifications?: number;

  // Platform admin flags (present when returned from /v1/me)
  is_platform_admin?: boolean;
  is_super_admin?: boolean;
  platform_admin_role?: "moderator" | "admin" | "super" | null;

  // Trust & safety enforcement
  strike_count?: number;
  banned_until?: string | null;
  banned_reason?: string | null;
};

export type VolunteerProfile = {
  // Account identity (private)
  full_name: string;
  phone: string | null;

  // Public profile (shown to others)
  display_name: string | null;
  avatar_url: string | null;
  public_location: string | null;
  // Legacy field (pre-public_location). Kept for backward compatibility.
  location?: string | null;
  bio: string | null;

  languages: string[];
  interaction_styles: string[];
  help_categories: string[];

  has_car: boolean | null;
  can_lift_heavy: boolean | null;
  stairs_ok: boolean | null;
  pet_friendly: boolean | null;
  service_radius_miles: number | null;

  experience: string | null;

  updated_at: string;
};

export type OnboardingProfile = {
  // Account identity (private)
  full_name: string;
  phone: string | null;

  // Public profile (shown to others)
  display_name: string | null;
  avatar_url: string | null;
  public_location: string | null;
  // Legacy field (pre-public_location). Kept for backward compatibility.
  location?: string | null;
  bio: string | null;

  languages: string[];
  interaction_styles: string[];

  // Broad availability labels shown before chat (weekdays/evenings/weekends)
  availability_windows?: string[];

  // Volunteer-specific (optional, depending on role)
  help_categories?: string[];
  has_car?: boolean | null;
  can_lift_heavy?: boolean | null;
  stairs_ok?: boolean | null;
  pet_friendly?: boolean | null;
  service_radius_miles?: number | null;
  experience?: string | null;
  experience_tags?: string[];

  // Individual requester-specific (optional, depending on role)
  need_categories?: string[];
  need_help_prompt?: string | null;

  parking_available?: boolean | null;
  elevator_available?: boolean | null;
  stairs_present?: boolean | null;
  pickup_vs_dropoff?: "pickup" | "dropoff" | "either" | null;
  time_flexibility?: "low" | "medium" | "high" | null;

  pets_at_home?: boolean | null;
  smoke_free?: boolean | null;
  accessibility_needs?: string | null;

  meet_in_public_first?: boolean | null;
  someone_else_present?: boolean | null;
  mask_preferred?: boolean | null;

  updated_at: string;
};
export type RequesterProfile = {
  // Account identity (private)
  full_name: string | null;
  phone: string | null;

  // Public profile (shown to others)
  display_name: string | null;
  avatar_url: string | null;
  public_location: string | null;
  // Legacy field (pre-public_location). Kept for backward compatibility.
  location?: string | null;
  bio: string | null;

  languages: string[];
  interaction_styles: string[];
  availability_windows: string[];

  // Requester-specific
  need_categories: string[];
  need_help_prompt: string | null;

  parking_available: boolean | null;
  elevator_available: boolean | null;
  stairs_present: boolean | null;
  pickup_vs_dropoff: "pickup" | "dropoff" | "either" | null;
  time_flexibility: "low" | "medium" | "high" | null;

  pets_at_home: boolean | null;
  smoke_free: boolean | null;
  accessibility_needs: string | null;

  meet_in_public_first: boolean | null;
  someone_else_present: boolean | null;
  mask_preferred: boolean | null;

  updated_at: string;
};

export type RequesterProfileEnvelope = {
  profile: RequesterProfile | null;
  verification: {
    email_verified: boolean;
    phone_verified: boolean;
    id_verification_status: string | null;
  };
  trust: {
    completed_commitments_count: number;
    cancellation_rate: number | null;
    typical_response_time_seconds: number | null;
    thank_you_notes_count: number;
  };
};

export async function getRequesterProfile(): Promise<RequesterProfileEnvelope | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await backendFetch("/v1/requester/profile", { method: "GET" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  return (data as RequesterProfileEnvelope) || null;
}



export async function getVolunteerProfile(): Promise<VolunteerProfile | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await backendFetch("/v1/volunteer/profile", { method: "GET" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  return (data?.profile as VolunteerProfile) || null;
}

export async function getOnboardingProfile(): Promise<OnboardingProfile | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await backendFetch("/v1/onboarding/profile", { method: "GET" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  return (data?.profile as OnboardingProfile) || null;
}


export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get("ty_session")?.value || null;
}

function stripTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function joinUrl(base: string, path: string) {
  const b = stripTrailingSlash(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

const BACKEND_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 8000);

/**
 * Server-side fetch to the API with the user's session forwarded as a bearer token.
 * One configured base URL (API_BASE_URL or NEXT_PUBLIC_API_BASE_URL) and a hard timeout;
 * failures come back as a 503 Response instead of throwing.
 */
export async function backendFetch(path: string, init: RequestInit = {}) {
  const token = await getSessionToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  for (const [k, v] of Object.entries(await forwardHeaders())) if (!headers.has(k)) headers.set(k, v);

  // If caller sets cache explicitly, respect it; otherwise default to no-store.
  const cache = init.cache ?? "no-store";
  const url = path.startsWith("http") ? path : joinUrl(stripTrailingSlash(API_BASE_URL_SERVER), path);

  try {
    return await fetch(url, { ...init, headers, cache, signal: init.signal ?? AbortSignal.timeout(BACKEND_TIMEOUT_MS) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: "backend_fetch_failed", message }), {
      status: 503,
      headers: { "content-type": "application/json" }
    });
  }
}

async function loadCurrentUser(): Promise<CurrentUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await backendFetch("/v1/me", { method: "GET" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  return (data?.user as CurrentUser) || null;
}

/**
 * The signed-in user for this request. Wrapped in React cache() so the root layout,
 * section layouts and the page share ONE /v1/me round-trip per request.
 */
export const getCurrentUser = cache(loadCurrentUser);




export type ShareModerationSummary = {
  reported_links: number;
  auto_revoked_links: number;
  reports_last_30d: number;
  last_reported_at: string | null;
  share_creation_restricted: boolean;
  thresholds: { auto_revoke_reports: number; restrict_reports_30d: number };
};

export async function getMyShareModerationSummary(): Promise<ShareModerationSummary | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const res = await backendFetch("/v1/me/moderation", { method: "GET" });
  if (!res.ok) return null;

  const data = (await res.json().catch(() => null)) as any;
  return (data as ShareModerationSummary) || null;
}


/**
 * Keeps the session's active context in step with the area being viewed, so shared screens
 * (settings, notifications) follow what the person is doing. Idempotent; failures are ignored.
 */
export async function syncActiveContext(user: CurrentUser, context: string) {
  if (user.active_context === context) return;
  if (user.contexts && !user.contexts.includes(context)) return;
  await backendFetch("/v1/me/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context })
  }).catch(() => null);
}
