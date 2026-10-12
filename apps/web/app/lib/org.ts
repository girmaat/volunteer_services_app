import { cache } from "react";
import { backendFetch, getCurrentUser } from "./backend";

export type OrgContext = {
  org: {
    slug: string;
    name: string;
    summary: string;
    location: string;
    mission: string | null;
    website_url: string | null;
    contact_email: string | null;
    logo_url: string | null;
    onboarding_completed: boolean;
    updated_at: string;
    verification_required: boolean;
    verification_status: string;
    verification_submitted_at: string | null;
    verification_submission_notes: string | null;
    verification_notes: string | null;
    verified_at: string | null;
    preferred_skills?: string[];
    service_area?: string | null;
    hours?: string | null;
    contact_phone?: string | null;
    preferred_contact_method?: string | null;
    publication_policy?: "owner_all" | "owner_first_and_high_risk" | "delegated";
    org_type?: string;
    suspended_at?: string | null;
    suspended_reason?: string | null;
  };
  membership: {
    role: "admin" | "manager" | "member" | "coordinator";
    status: "active" | "invited";
  };
};

async function loadOrgContext(): Promise<OrgContext | null> {
  // /v1/me (cached per request) already carries the org context for org members.
  const me = (await getCurrentUser()) as { org_context?: OrgContext | null } | null;
  if (me && me.org_context !== undefined) return me.org_context;
  const res = await backendFetch("/v1/org/me", { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as OrgContext;
}
/** Org context for the signed-in user, fetched once per request. */
export const getOrgContext = cache(loadOrgContext);
