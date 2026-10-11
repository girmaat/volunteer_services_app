import styles from "./page.module.css";
import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import ShareButton from "../../_components/share/ShareButton";

export const dynamic = "force-dynamic";

type Org = {
  slug: string;
  name: string;
  summary: string;
  location: string;
  updated_at: string;
  verification_status?: string | null;
};

async function getOrg(slug: string): Promise<Org> {
  const res = await backendFetch(`/v1/public/organizations/${encodeURIComponent(slug)}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load organization");
  return res.json();
}

export default async function Page({ params }: { params: { slug: string } }) {
  const me = await getCurrentUser().catch(() => null);

  if (!me) {
    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <p className={styles.breadcrumb}>
            <Link href="/organizations">← Back to Organizations</Link>
          </p>

          <h1 className={styles.title}>Sign in to view this organization</h1>
          <p className={styles.subtitle}>Organization profiles are available only to logged-in users.</p>
        </header>

        <div className={styles.content}>
          <p className={styles.cardBody}>Please sign in (or create an account) to view organization details.</p>

          <div className={styles.buttonRow}>
            <Link className={styles.button} href="/login">
              Sign in
            </Link>
            <Link className={styles.button} href="/signup">
              Create account
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const org = await getOrg(params.slug);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            {org.name}
          </h1>
          {org.verification_status === "approved" || org.verification_status === "verified" ? (
            <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, border: "1px solid rgba(0,0,0,0.18)" }}>
              Verified
            </span>
          ) : null}
          <ShareButton target={{ type: "org", ref: org.slug, title: org.name }} label="Share" />
        </div>

        <p className={styles.subtitle}>Organization profile</p>

        {(me as any)?.is_platform_admin ? (
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className={styles.badge} href="/admin/organizations" style={{ textDecoration: "none" }}>
              ← Back to organization management
            </Link>
            <Link className={styles.badge} href="/admin" style={{ textDecoration: "none" }}>
              Admin dashboard
            </Link>
            <Link className={styles.badge} href={`/opportunities?org=${encodeURIComponent(org.slug)}`} style={{ textDecoration: "none" }}>
              View open opportunities
            </Link>
          </div>
        ) : null}
      </header>

      <div className={styles.content}>
        <p className={styles.cardBody}>{org.summary}</p>
        <p className={styles.cardBody}>
          <strong>Location:</strong> {org.location}
        </p>
        <p className={styles.note}>More details will appear here as organizations complete their profiles.</p>
      </div>
    </section>
  );
}



