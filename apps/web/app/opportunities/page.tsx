import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import { listPublicOpportunities } from "../../lib/public-api";
import OpportunityRow from "../../components/opportunities/OpportunityRow";
import { buttonClass } from "../../components/ui/Button";
import { EmptyState, Notice } from "../../components/ui/Card";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description: "Browse in-person, remote and hybrid volunteer opportunities from verified organizations and neighbors."
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) || "";
}

const MODES = [
  { value: "", label: "Anywhere" },
  { value: "in-person", label: "In person" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" }
];

export default async function Page(props: { searchParams?: Promise<SearchParams> }) {
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser().catch(() => null);

  // Volunteers get the personalised feed (recommended / nearby / remote).
  if (me?.role === "volunteer" && !me.is_platform_admin) redirect("/volunteer/opportunities/recommended");

  const mode = one(sp.mode);
  const q = one(sp.q).slice(0, 100);
  const org = one(sp.org);
  const cursor = one(sp.cursor);
  const list = await listPublicOpportunities({ limit: 20, mode, q, org, cursor });

  const hrefWith = (patch: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ mode, q, org, ...patch })) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/opportunities?${s}` : "/opportunities";
  };
  const filtered = Boolean(q || mode || org);

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl sm:text-3xl">Volunteer opportunities</h1>
          <p className="m-0 mt-2 max-w-[60ch] text-muted">
            Exact addresses and contact details are shared only after an application is accepted.
          </p>
        </div>
        {!me ? (
          <Link className={buttonClass("primary", "md")} href="/signup">
            Create an account to apply
          </Link>
        ) : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <form action="/opportunities" method="get" role="search" className="grid content-start gap-5 lg:sticky lg:top-24">
          <div className="grid gap-1.5">
            <label htmlFor="opp-q" className="text-sm font-medium">
              Search
            </label>
            <input id="opp-q" name="q" defaultValue={q} placeholder="Tutoring, food bank…" className="h-11 rounded border border-line-strong bg-surface px-3" />
          </div>
          {org ? <input type="hidden" name="org" value={org} /> : null}
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1.5 p-0 text-sm font-medium">Where</legend>
            {MODES.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="mode" value={m.value} defaultChecked={mode === m.value} className="h-4 w-4 accent-[var(--primary)]" />
                {m.label}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1")}>
              Show results
            </button>
            {filtered ? (
              <Link href="/opportunities" className={buttonClass("ghost", "md")}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        <section aria-labelledby="opp-results" aria-live="polite">
          <h2 id="opp-results" className="sr-only">
            Open opportunities
          </h2>
          {list.error ? <Notice tone="danger">Opportunities are unavailable right now. Try again in a moment.</Notice> : null}
          {!list.error && list.items.length === 0 ? (
            <EmptyState
              title="Nothing matches yet"
              body="Try a broader search or a different location."
              action={
                <Link className={buttonClass("secondary", "md")} href="/opportunities">
                  Clear filters
                </Link>
              }
            />
          ) : null}
          {list.items.length ? (
            <ul className="m-0 border-t border-line p-0">
              {list.items.map((o) => (
                <OpportunityRow key={o.id} o={o} href={`/opportunities/${o.id}`} />
              ))}
            </ul>
          ) : null}
          {list.nextCursor ? (
            <div className="mt-6">
              <Link className={buttonClass("secondary", "md")} href={hrefWith({ cursor: list.nextCursor })}>
                Show more
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
