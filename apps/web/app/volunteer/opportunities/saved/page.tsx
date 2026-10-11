import { backendFetch } from "../../../lib/backend";
import { ButtonLink, EmptyState, LinkTabs, Notice, PageHeader } from "../../../../components/ui";
import OpportunityRow, { type OpportunitySummary } from "../../../../components/opportunities/OpportunityRow";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/volunteer/opportunities/recommended", label: "Recommended" },
  { href: "/volunteer/opportunities/nearby", label: "Near you" },
  { href: "/volunteer/opportunities/remote", label: "Remote" },
  { href: "/volunteer/opportunities/saved", label: "Saved" }
];

export default async function Page() {
  const res = await backendFetch("/v1/volunteer/opportunities/saved");
  const items = res.ok ? ((await res.json()) as OpportunitySummary[]) : null;
  return (
    <>
      <PageHeader title="Saved" description="Opportunities you bookmarked. Ones that close or fill drop off automatically." />
      <LinkTabs label="Opportunity lists" items={TABS} />
      {items === null ? <Notice tone="danger">Saved opportunities couldn&apos;t load. Refresh to try again.</Notice> : null}
      {items && items.length === 0 ? (
        <EmptyState title="Nothing saved yet" body="Tap Save on any opportunity to keep it here." action={<ButtonLink href="/volunteer/opportunities/recommended">Find opportunities</ButtonLink>} />
      ) : null}
      {items?.length ? (
        <ul className="m-0 border-t border-line p-0">
          {items.map((o) => (
            <OpportunityRow key={o.id} o={o} href={`/volunteer/opportunities/${o.id}`} />
          ))}
        </ul>
      ) : null}
    </>
  );
}
