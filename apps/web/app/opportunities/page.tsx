import styles from "./page.module.css";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import { listPublicOpportunities, modeLabel } from "../../lib/public-api";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description: "Browse in-person, remote and hybrid volunteer opportunities from verified organizations and neighbors."
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) || "";
}

const MODES = [
  { value: "", label: "All" },
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
  const list = await listPublicOpportunities({ limit: 24, mode, q, org, cursor });

  const hrefWith = (patch: Record<string, string>) => {
    const u = new URLSearchParams();
    const merged = { mode, q, org, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `/opportunities?${s}` : "/opportunities";
  };

  return (
    <section className={styles.page}>
      <header className={styles.authedHeader}>
        <div>
          <div className={styles.kicker}>Volunteer opportunities</div>
          <h1 className={styles.authedTitle}>Find meaningful ways to help</h1>
          <p className={styles.subtitle}>
            Exact addresses and contact details are shared only after an application is accepted.
          </p>
        </div>
        {!me ? (
          <div className={styles.authedActions}>
            <Link className={styles.primaryCta} href="/signup">
              Create account
            </Link>
            <Link className={styles.secondaryCta} href="/login">
              Sign in
            </Link>
          </div>
        ) : null}
      </header>

      <form className={styles.noteBox} action="/opportunities" method="get" role="search">
        <label>
          <span className={styles.noteTitle}>Search</span>{" "}
          <input name="q" defaultValue={q} placeholder="e.g. tutoring, food bank" aria-label="Search opportunities" />
        </label>{" "}
        {org ? <input type="hidden" name="org" value={org} /> : null}
        <select name="mode" defaultValue={mode} aria-label="Service mode">
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>{" "}
        <button type="submit" className={styles.smallCta}>
          Apply filters
        </button>
      </form>

      {list.error ? (
        <div className={styles.errorBox} role="alert">
          Opportunities are unavailable right now. Please try again shortly.
        </div>
      ) : null}

      {!list.error && list.items.length === 0 ? (
        <div className={styles.noteBox}>
          <div className={styles.noteTitle}>No opportunities match</div>
          <div className={styles.noteBody}>
            Try a different search, or <Link href="/opportunities">clear the filters</Link>.
          </div>
        </div>
      ) : null}

      <div className={styles.opportunityGrid} aria-label="Open opportunities">
        {list.items.map((o) => {
          const href = `/opportunities/${encodeURIComponent(o.id)}`;
          return (
            <article key={o.id} className={styles.opportunityCard}>
              <div className={styles.opportunityTop}>
                <Link href={href} className={styles.opportunityTitleLink}>
                  <h2 className={styles.opportunityTitle}>{o.title}</h2>
                </Link>
                <div className={styles.opportunityMeta}>
                  {modeLabel(o.mode)} · {o.location}
                  {o.organization_name ? ` · ${o.organization_name}${o.organization_verified ? " (verified)" : ""}` : ""}
                </div>
              </div>
              <div className={styles.opportunityBody}>{o.summary}</div>
              <div className={styles.opportunityFoot}>
                {o.needed_by ? `Needed by ${new Date(o.needed_by).toLocaleDateString()}` : "Flexible timing"}
              </div>
              <div className={styles.opportunityActions}>
                <Link className={styles.actionPrimary} href={href}>
                  View details
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {list.nextCursor ? (
        <p>
          <Link className={styles.secondaryCta} href={hrefWith({ cursor: list.nextCursor })}>
            More opportunities →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
