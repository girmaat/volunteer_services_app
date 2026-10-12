import Link from "next/link";
import { backendFetch } from "../../../lib/backend";
import { Button, ButtonLink, EmptyState, LinkTabs, Notice, PageHeader } from "../../../../components/ui";
import OpportunityRow, { type OpportunitySummary } from "../../../../components/opportunities/OpportunityRow";
import { deleteSavedSearchAction, updateSavedSearchAction } from "../../../_alerts/actions";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/volunteer/opportunities/recommended", label: "Recommended" },
  { href: "/volunteer/opportunities/nearby", label: "Near you" },
  { href: "/volunteer/opportunities/remote", label: "Remote" },
  { href: "/volunteer/opportunities/saved", label: "Saved" }
];

type SavedSearch = { id: string; name: string; query: string; alerts: boolean; frequency: "daily" | "weekly"; last_notified_at: string | null };

const FEED: Record<string, string> = { recommended: "recommended", nearby: "nearby", remote: "remote" };
/** Where a saved search opens: its own feed with the same filters. */
function openHref(query: string) {
  const p = new URLSearchParams(query);
  const tab = FEED[p.get("tab") || ""] || "recommended";
  p.delete("tab");
  const verified = p.get("verified_org");
  if (verified) {
    p.delete("verified_org");
    p.set("verified", "1");
  }
  const s = p.toString();
  return `/volunteer/opportunities/${tab}${s ? `?${s}` : ""}`;
}

const FLASH: Record<string, string> = { alerts: "Alert settings saved.", deleted: "Saved search deleted." };

export default async function Page(props: { searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const [res, sres] = await Promise.all([backendFetch("/v1/volunteer/opportunities/saved"), backendFetch("/v1/volunteer/saved-searches")]);
  const items = res.ok ? ((await res.json()) as OpportunitySummary[]) : null;
  const searches = sres.ok ? ((await sres.json()) as { saved_searches: SavedSearch[] }).saved_searches : [];
  return (
    <>
      <PageHeader title="Saved" description="Opportunities you bookmarked, and searches that alert you to new matches." />
      <LinkTabs label="Opportunity lists" items={TABS} />
      {sp.flash && FLASH[sp.flash] ? (
        <div className="mb-4">
          <Notice tone="success">{FLASH[sp.flash]}</Notice>
        </div>
      ) : null}
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
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

      <section id="searches" aria-labelledby="searches-h" className="mt-10">
        <h2 id="searches-h" className="m-0 mb-1 text-lg">
          Saved searches
        </h2>
        <p className="m-0 mb-4 text-sm text-muted">Search or filter on any list, then choose Save search. New matches arrive as a notification (and email, if it’s on in Notifications).</p>
        {!searches.length ? (
          <p className="m-0 text-sm text-muted">No saved searches yet.</p>
        ) : (
          <ul className="m-0 grid gap-3 p-0">
            {searches.map((s) => (
              <li key={s.id} className="list-none rounded-md border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link prefetch={false} href={openHref(s.query)} className="font-semibold">
                    {s.name}
                  </Link>
                  <span className="text-xs text-muted">{s.last_notified_at ? `Last alert ${new Date(s.last_notified_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No alerts yet"}</span>
                </div>
                <form action={updateSavedSearchAction.bind(null, s.id)} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="alerts" defaultChecked={s.alerts} className="h-4 w-4" />
                    Alert me
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="sr-only">How often</span>
                    <select name="frequency" defaultValue={s.frequency} className="h-9 rounded border border-line-strong bg-surface px-2">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                  <Button type="submit" size="sm" variant="secondary">
                    Save
                  </Button>
                  <Button type="submit" size="sm" variant="ghost" formAction={deleteSavedSearchAction.bind(null, s.id)}>
                    Delete
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
