import { hasRole } from "../../../lib/access";
import { notFound, redirect } from "next/navigation";
import OpportunityDetail, { type OpportunityDetailData } from "../../../components/opportunities/OpportunityDetail";
import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";
import { getPublicOpportunity } from "../../../lib/public-api";
import type { Metadata } from "next";
import { backendFetch, getCurrentUser } from "../../lib/backend";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params;
  const o = await getPublicOpportunity(decodeURIComponent(id));
  if (!o) return { title: "Opportunity not found", robots: { index: false } };
  const where = o.mode === "remote" ? "Remote" : o.location;
  return {
    title: o.title,
    description: `${where} · ${o.summary}`.slice(0, 160),
    openGraph: { title: o.title, description: o.summary.slice(0, 200), type: "article" },
    alternates: { canonical: `/opportunities/${o.id}` }
  };
}

/** schema.org JobPosting with employmentType VOLUNTEER (supported by search engines). */
function jsonLd(o: NonNullable<Awaited<ReturnType<typeof getPublicOpportunity>>>) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: o.title,
    description: o.summary,
    employmentType: "VOLUNTEER",
    datePosted: o.updated_at,
    ...(o.needed_by ? { validThrough: o.needed_by } : {}),
    hiringOrganization: { "@type": "Organization", name: o.organization_name || "Volunteer Services community member" },
    ...(o.mode === "remote"
      ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "US" } }
      : { jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: o.location } } })
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function OpportunityDetailPage(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const { id: raw } = await props.params;
  const id = decodeURIComponent(raw);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser().catch(() => null);

  // Volunteers get the full volunteer view (apply, save, match reasons).
  if (hasRole(me, "volunteer")) redirect(`/volunteer/opportunities/${encodeURIComponent(id)}`);

  const res = me
    ? await backendFetch(`/v1/discovery/opportunities/${encodeURIComponent(id)}`)
    : await fetch(`${API_BASE_URL_SERVER}/v1/discovery/opportunities/${encodeURIComponent(id)}`, { next: { revalidate: 60 } });
  if (!res.ok) {
    // Owners land on their management page instead of a 404.
    if (me) {
      const own = await backendFetch(`/v1/requests/${encodeURIComponent(id)}`);
      if (own.ok) {
        const r = (await own.json()) as { requester_org_slug: string | null };
        redirect(r.requester_org_slug ? `/org/requests/${id}` : `/requester/requests/${id}`);
      }
    }
    notFound();
  }
  const o = (await res.json()) as OpportunityDetailData;
  const pub = await getPublicOpportunity(id);
  return (
    <>
      {pub ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pub) }} /> : null}
      <OpportunityDetail o={o} viewer={me ? "member" : "anon"} returnTo={`/opportunities/${id}`} flash={sp.flash} error={sp.error} />
    </>
  );
}
