import styles from "./page.module.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../lib/backend";

export const dynamic = "force-dynamic";

type Org = {
  slug: string;
  name: string;
  summary: string;
  location: string;
  updated_at: string;
  verification_status?: string | null;
};

async function getOrganizations(): Promise<Org[]> {
  const res = await backendFetch("/v1/public/organizations", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load organizations");
  return res.json();
}

function isVerified(status?: string | null) {
  return status === "approved" || status === "verified";
}

export default async function Page() {
  const me = await getCurrentUser().catch(() => null);

  if (!me) {
    return (
      <section className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.kicker}>Organizations</div>
            <h1 className={styles.title}>Meet the partners behind the work.</h1>
            <p className={styles.subtitle}>
              We show full organization directories and profiles to signed-in members to protect volunteers and
              organizations alike.
            </p>

            <div className={styles.ctas}>
              <Link className={styles.primaryCta} href="/signup">
                Create account
              </Link>
              <Link className={styles.secondaryCta} href="/login">
                Sign in
              </Link>
            </div>

            <div className={styles.subCtas}>
              <Link className={styles.textLink} href="/impact-stories">
                See what’s possible →
              </Link>
              <Link className={styles.textLink} href="/opportunities">
                Explore opportunities →
              </Link>
            </div>
          </div>

          <div className={styles.heroPanel} aria-hidden="true">
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>Preview</div>
              <div className={styles.lockPill}>🔒 Sign in required</div>
            </div>

            <div className={styles.previewGrid}>
              <article className={styles.previewCard}>
                <div className={styles.previewTop}>
                  <div className={styles.previewTitle}>Community Food Network</div>
                  <div className={styles.previewMeta}>Local · Verified</div>
                </div>
                <div className={styles.previewBody}>Mission, locations, and contact links appear after sign in.</div>
              </article>

              <article className={styles.previewCard}>
                <div className={styles.previewTop}>
                  <div className={styles.previewTitle}>Youth Mentorship Alliance</div>
                  <div className={styles.previewMeta}>Remote + In‑person</div>
                </div>
                <div className={styles.previewBody}>See programs, open requests, and volunteer requirements.</div>
              </article>

              <article className={styles.previewCard}>
                <div className={styles.previewTop}>
                  <div className={styles.previewTitle}>Neighborhood Mutual Aid</div>
                  <div className={styles.previewMeta}>Community-led</div>
                </div>
                <div className={styles.previewBody}>Browse partner profiles and apply to opportunities securely.</div>
              </article>
            </div>
          </div>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Why sign in is required</h2>
          <div className={styles.features}>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Safer community</div>
              <div className={styles.featureBody}>Limit exposure of contact details and sensitive operations.</div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Better matching</div>
              <div className={styles.featureBody}>Personalized recommendations based on your profile and availability.</div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Accountability</div>
              <div className={styles.featureBody}>Reviews, attendance, and impact tracking help build trust over time.</div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.noteBox}>
            <div className={styles.noteTitle}>Represent an organization?</div>
            <div className={styles.noteBody}>
              Create an account to register your organization, post requests, and manage volunteers.
            </div>
            <div className={styles.noteActions}>
              <Link className={styles.smallCta} href="/signup">
                Get started
              </Link>
              <Link className={styles.textLink} href="/contact">
                Contact us →
              </Link>
            </div>
          </div>
        </section>
      </section>
    );
  }

  if ((me as any).is_platform_admin) redirect("/admin/organizations");

  if (me.role === "org_admin") redirect("/org/dashboard");
  if (me.role === "requester") redirect("/org/signup");
  if (me.role !== "volunteer") redirect("/dashboard");

  const orgs = await getOrganizations();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Organizations</h1>
        <p className={styles.subtitle}>Browse community partners and learn about their mission.</p>
      </header>

      <div className={styles.grid}>
        {orgs.map((o) => (
          <article key={o.slug} className={styles.card}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h2 className={styles.cardTitle} style={{ margin: 0 }}>
                <Link href={`/organizations/${encodeURIComponent(o.slug)}`}>{o.name}</Link>
              </h2>
              {isVerified(o.verification_status) ? <span className={styles.badge}>Verified</span> : null}
            </div>

            <div className={styles.meta}>
              {o.location ? `Location: ${o.location}` : "Location not listed"} · Updated{" "}
              {new Date(o.updated_at).toLocaleDateString()}
            </div>

            <p className={styles.cardBody}>{o.summary}</p>

            <p className={styles.cardBody}>
              <Link href={`/organizations/${encodeURIComponent(o.slug)}`}>View profile</Link>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
