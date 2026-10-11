import { backendFetch } from "./backend";

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
  };
  membership: {
    role: "admin" | "manager" | "member";
    status: "active" | "invited";
  };
};

export async function getOrgContext(): Promise<OrgContext | null> {
  const res = await backendFetch("/v1/org/me", { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as OrgContext;
}