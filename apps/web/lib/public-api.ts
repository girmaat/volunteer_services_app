import "server-only";
import { API_BASE_URL_SERVER } from "@thankyou/config";

/**
 * Fetchers for the API's public (unauthenticated) endpoints.
 * They never send the session cookie, so pages using only these can be statically generated
 * and revalidated (ISR) instead of rendering on every request.
 */

export type Page<T> = { items: T[]; nextCursor: string | null };

export type PublicOpportunity = {
  id: string;
  title: string;
  summary: string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string;
  tags: string[];
  needed_by: string | null;
  organization_name: string | null;
  organization_slug: string | null;
  organization_verified: boolean;
  updated_at: string;
};

export type PublicOrganization = {
  slug: string;
  name: string;
  summary: string;
  location: string | null;
  verified: boolean;
  updated_at: string;
};

export type PublicOrganizationDetail = PublicOrganization & {
  mission: string | null;
  website_url: string | null;
  logo_url: string | null;
  open_requests: number;
};

export type PublicPage = { slug: string; title: string; body: string; updated_at: string };

const TIMEOUT_MS = 5000;

async function getJson<T>(path: string, revalidate: number): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const res = await fetch(`${API_BASE_URL_SERVER}${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 503 };
  }
}

function qs(params: Record<string, string | number | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

export async function listPublicOpportunities(params: { limit?: number; cursor?: string; org?: string; mode?: string; q?: string } = {}) {
  const r = await getJson<Page<PublicOpportunity>>(`/v1/public/opportunities${qs(params)}`, 30);
  return r.ok ? { ...r.data, error: null as number | null } : { items: [], nextCursor: null, error: r.status };
}

export async function getPublicOpportunity(id: string) {
  const r = await getJson<PublicOpportunity>(`/v1/public/opportunities/${encodeURIComponent(id)}`, 30);
  return r.ok ? r.data : null;
}

export async function listPublicOrganizations(params: { limit?: number; cursor?: string; q?: string } = {}) {
  const r = await getJson<Page<PublicOrganization>>(`/v1/public/organizations${qs(params)}`, 60);
  return r.ok ? { ...r.data, error: null as number | null } : { items: [], nextCursor: null, error: r.status };
}

export async function getPublicOrganization(slug: string) {
  const r = await getJson<PublicOrganizationDetail>(`/v1/public/organizations/${encodeURIComponent(slug)}`, 60);
  return r.ok ? r.data : null;
}

export async function getPublicPage(slug: string): Promise<PublicPage | null> {
  const r = await getJson<PublicPage>(`/v1/public/pages/${encodeURIComponent(slug)}`, 300);
  return r.ok ? r.data : null;
}

export function modeLabel(mode: string) {
  return mode === "in-person" ? "In person" : mode === "hybrid" ? "Hybrid" : "Remote";
}

export type PublicAd = { id: string; title: string; body: string | null; link_url: string | null; image_url: string | null; placement: "left" | "right" };

/** Live ads for each side panel (empty when an admin turned that side off). Refreshed every minute. */
export async function getPublicAds(): Promise<{ left: PublicAd[]; right: PublicAd[] }> {
  const r = await getJson<{ left: PublicAd[]; right: PublicAd[] }>("/v1/public/ads", 60);
  return r.ok ? r.data : { left: [], right: [] };
}
