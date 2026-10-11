import Link from "next/link";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import { backendFetch } from "../../app/lib/backend";
import OpportunityRow, { type OpportunitySummary } from "./OpportunityRow";
import { buttonClass } from "../ui/Button";
import { EmptyState, Notice } from "../ui/Card";
import { LinkTabs } from "../ui/Tabs";
import type { Category } from "../../lib/requests";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export type FindTab = "recommended" | "nearby" | "remote" | "all";

const VOLUNTEER_TABS = [
  { href: "/volunteer/opportunities/recommended", label: "Recommended" },
  { href: "/volunteer/opportunities/nearby", label: "Near you" },
  { href: "/volunteer/opportunities/remote", label: "Remote" },
  { href: "/volunteer/opportunities/saved", label: "Saved" }
];

const MODES = [
  { value: "", label: "Anywhere" },
  { value: "in-person", label: "In person" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" }
];

/**
 * Search + filters + results, used by the public browse page (tab "all") and the volunteer
 * feeds (Recommended · Near you · Remote). Filters are a plain GET form, so it works without JS.
 */
export default async function FindOpportunities({
  sp,
  tab,
  basePath,
  detailBase,
  personalized,
  categories
}: {
  sp: SP;
  tab: FindTab;
  basePath: string;
  detailBase: string;
  personalized: boolean;
  categories: Category[];
}) {
  const q = one(sp.q).slice(0, 100);
  const category = one(sp.category);
  const mode = tab === "remote" ? "" : one(sp.mode);
  const radius = one(sp.radius);
  const verified = one(sp.verified) === "1";
  const org = one(sp.org);
  const cursor = one(sp.cursor);

  const params = new URLSearchParams({ tab, limit: "20" });
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (mode) params.set("mode", mode);
  if (radius && tab === "nearby") params.set("radius", radius);
  if (verified) params.set("verified_org", "true");
  if (org) params.set("org", org);
  if (cursor) params.set("cursor", cursor);

  const path = `/v1/discovery/opportunities?${params}`;
  const res = personalized
    ? await backendFetch(path).catch(() => null)
    : await fetch(`${API_BASE_URL_SERVER}${path}`, { next: { revalidate: 30 }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  const data = res && res.ok ? ((await res.json()) as { items: OpportunitySummary[]; nextCursor: string | null; needsLocation: boolean; viewer: { timezone: string | null; radius: number } | null }) : null;

  const keep = (patch: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, category, mode, radius, verified: verified ? "1" : "", org, ...patch })) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const filtered = Boolean(q || category || mode || verified || org || radius);
  const viewerTz = data?.viewer?.timezone ?? null;

  return (
    <div className="grid gap-6">
      {personalized ? <LinkTabs label="Opportunity lists" items={VOLUNTEER_TABS} /> : null}
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <form action={basePath} method="get" role="search" className="grid content-start gap-5 lg:sticky lg:top-24">
          <div className="grid gap-1.5">
            <label htmlFor="opp-q" className="text-sm font-medium">
              Search
            </label>
            <input id="opp-q" name="q" defaultValue={q} placeholder="Tutoring, food bank…" className="h-11 rounded border border-line-strong bg-surface px-3" />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="opp-cat" className="text-sm font-medium">
              Category
            </label>
            <select id="opp-cat" name="category" defaultValue={category} className="h-11 rounded border border-line-strong bg-surface px-3">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {tab !== "remote" && tab !== "nearby" ? (
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-1.5 p-0 text-sm font-medium">Where</legend>
              {MODES.map((m) => (
                <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="mode" value={m.value} defaultChecked={mode === m.value} className="h-4 w-4 accent-[var(--primary)]" />
                  {m.label}
                </label>
              ))}
            </fieldset>
          ) : null}
          {tab === "nearby" ? (
            <div className="grid gap-1.5">
              <label htmlFor="opp-radius" className="text-sm font-medium">
                Within
              </label>
              <select id="opp-radius" name="radius" defaultValue={radius || String(data?.viewer?.radius ?? 25)} className="h-11 rounded border border-line-strong bg-surface px-3">
                {[2, 5, 10, 15, 25, 50].map((r) => (
                  <option key={r} value={r}>
                    {r} miles
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="verified" value="1" defaultChecked={verified} className="h-4 w-4 accent-[var(--primary)]" />
            Verified organizations only
          </label>
          {org ? <input type="hidden" name="org" value={org} /> : null}
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1")}>
              Show results
            </button>
            {filtered ? (
              <Link href={basePath} className={buttonClass("ghost", "md")}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <section aria-labelledby="opp-results" aria-live="polite">
          <h2 id="opp-results" className="sr-only">
            Results
          </h2>
          {!data ? <Notice tone="danger">Opportunities are unavailable right now. Try again in a moment.</Notice> : null}
          {data?.needsLocation ? (
            <EmptyState
              title="Add your location to see what's near you"
              body="We use your neighborhood or ZIP code to find in-person opportunities. It's never shown to anyone."
              action={<Link className={buttonClass("primary", "md")} href="/volunteer/profile">Update profile</Link>}
            />
          ) : null}
          {data && !data.needsLocation && data.items.length === 0 ? (
            <EmptyState
              title="Nothing matches yet"
              body={tab === "recommended" ? "Add skills and the causes you care about to your profile to get better matches." : "Try a broader search or a different area."}
              action={
                filtered ? (
                  <Link className={buttonClass("secondary", "md")} href={basePath}>
                    Clear filters
                  </Link>
                ) : undefined
              }
            />
          ) : null}
          {data?.items.length ? (
            <ul className="m-0 border-t border-line p-0">
              {data.items.map((o) => (
                <OpportunityRow key={o.id} o={o} href={`${detailBase}/${o.id}`} viewerTz={viewerTz} />
              ))}
            </ul>
          ) : null}
          {data?.nextCursor ? (
            <div className="mt-6">
              <Link className={buttonClass("secondary", "md")} href={keep({ cursor: data.nextCursor })}>
                Show more
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
