import styles from "./page.module.css";
import Link from "next/link";
import type { Metadata } from "next";
import { listPublicOrganizations } from "../../lib/public-api";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Organizations",
  description: "Nonprofits and community groups posting volunteer opportunities on ThankYou.",
  alternates: { canonical: "/organizations" }
};

export default async function Page() {
  const { items: orgs, error } = await listPublicOrganizations({ limit: 48 });

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.kicker}>Organizations</div>
        <h1 className={styles.title}>Meet the partners behind the work</h1>
        <p className={styles.subtitle}>
          Community partners posting opportunities on ThankYou. Verified organizations have completed our review.
        </p>
      </header>

      {error ? (
        <div className={styles.noteBox} role="alert">
          <div className={styles.noteTitle}>Organizations are unavailable right now</div>
          <div className={styles.noteBody}>Please try again in a moment.</div>
        </div>
      ) : null}

      {!error && orgs.length === 0 ? (
        <div className={styles.noteBox}>
          <div className={styles.noteTitle}>No organizations yet</div>
          <div className={styles.noteBody}>Check back soon as partners join.</div>
        </div>
      ) : null}

      <div className={styles.grid}>
        {orgs.map((o) => (
          <article key={o.slug} className={styles.card}>
            <h2 className={styles.cardTitle}>
              <Link prefetch={false} href={`/organizations/${encodeURIComponent(o.slug)}`}>{o.name}</Link>{" "}
              {o.verified ? <span className={styles.badge}>Verified</span> : null}
            </h2>
            <div className={styles.meta}>{o.location || "Location not listed"}</div>
            <p className={styles.cardBody}>{o.summary}</p>
            <p className={styles.cardBody}>
              <Link prefetch={false} href={`/organizations/${encodeURIComponent(o.slug)}`}>View profile →</Link>
            </p>
          </article>
        ))}
      </div>

      <section className={styles.section}>
        <div className={styles.noteBox}>
          <div className={styles.noteTitle}>Represent an organization?</div>
          <div className={styles.noteBody}>Register your organization to post requests and manage volunteers.</div>
          <div className={styles.noteActions}>
            <Link prefetch={false} className={styles.smallCta} href="/org/signup">
              Register your organization
            </Link>
            <Link prefetch={false} className={styles.textLink} href="/contact">
              Contact us →
            </Link>
          </div>
        </div>
      </section>
    </section>
  );
}
