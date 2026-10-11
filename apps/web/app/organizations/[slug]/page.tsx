import styles from "./page.module.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ShareButton from "../../_components/share/ShareButton";
import { getPublicOrganization, listPublicOpportunities, modeLabel } from "../../../lib/public-api";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const org = await getPublicOrganization(slug);
  if (!org) return { title: "Organization not found" };
  return {
    title: org.name,
    description: org.summary.slice(0, 160),
    alternates: { canonical: `/organizations/${org.slug}` },
    openGraph: { title: org.name, description: org.summary.slice(0, 200), type: "profile" }
  };
}

export default async function Page(props: Props) {
  const { slug } = await props.params;
  const [org, opps] = await Promise.all([getPublicOrganization(slug), listPublicOpportunities({ org: slug, limit: 12 })]);
  if (!org) notFound();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.breadcrumb}>
          <Link href="/organizations">← All organizations</Link>
        </p>
        <h1 className={styles.title}>
          {org.name} {org.verified ? <span className={styles.badge}>Verified</span> : null}
        </h1>
        <p className={styles.subtitle}>{org.location || "Location not listed"}</p>
        <ShareButton target={{ type: "org", ref: org.slug, title: org.name }} label="Share" />
      </header>

      <div className={styles.content}>
        <p className={styles.cardBody}>{org.summary}</p>
        {org.mission ? (
          <p className={styles.cardBody}>
            <strong>Mission:</strong> {org.mission}
          </p>
        ) : null}
        {org.website_url ? (
          <p className={styles.cardBody}>
            <a href={org.website_url} rel="noopener noreferrer nofollow" target="_blank">
              Website ↗
            </a>
          </p>
        ) : null}

        <h2 className={styles.title}>Open opportunities ({org.open_requests})</h2>
        {opps.items.length === 0 ? <p className={styles.note}>No open opportunities right now.</p> : null}
        <ul>
          {opps.items.map((o) => (
            <li key={o.id} className={styles.cardBody}>
              <Link href={`/opportunities/${encodeURIComponent(o.id)}`}>{o.title}</Link> · {modeLabel(o.mode)} · {o.location}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
