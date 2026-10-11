import Link from "next/link";
import { notFound } from "next/navigation";
import { backendFetch } from "../../../lib/backend";
import OpportunityDetail, { type OpportunityDetailData } from "../../../../components/opportunities/OpportunityDetail";
import { applyToOpportunity, toggleSave } from "../../../../lib/opportunity-actions";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const { id } = await props.params;
  const sp = (await props.searchParams) || {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [res, feed] = await Promise.all([backendFetch(`/v1/volunteer/opportunities/${id}`), backendFetch("/v1/discovery/opportunities?limit=1")]);
  if (!res.ok) notFound();
  const o = (await res.json()) as OpportunityDetailData;
  const viewerTz = feed.ok ? ((await feed.json()) as { viewer: { timezone: string | null } | null }).viewer?.timezone ?? null : null;
  return (
    <>
      <p className="m-0 mb-4 text-sm">
        <Link href="/volunteer/opportunities/recommended" className="text-muted">
          ← Find opportunities
        </Link>
      </p>
      <OpportunityDetail
        o={o}
        viewer="volunteer"
        viewerTz={viewerTz}
        returnTo={`/volunteer/opportunities/${id}`}
        applyAction={applyToOpportunity.bind(null, "/volunteer/opportunities", id)}
        saveAction={toggleSave.bind(null, "/volunteer/opportunities", id)}
        flash={sp.flash}
        error={sp.error}
      />
    </>
  );
}
