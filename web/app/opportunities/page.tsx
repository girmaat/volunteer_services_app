import styles from "./page.module.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../lib/backend";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const me = await getCurrentUser().catch(() => null);

  if (!me) {
    return (
      <section className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroText}>
            <div className={styles.kicker}>Volunteer Opportunities</div>
            <h1 className={styles.title}>Find meaningful ways to help — safely.</h1>
            <p className={styles.subtitle}>
              Browse verified opportunities, message safely, and track your impact. We require sign in so we can protect
              members and keep sensitive details (like exact locations) private.
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
                Read impact stories →
              </Link>
              <Link className={styles.textLink} href="/organizations">
                Meet partner organizations →
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
                  <div className={styles.previewTitle}>Neighborhood Support</div>
                  <div className={styles.previewMeta}>In‑person · Flexible</div>
                </div>
                <div className={styles.previewBody}>
                  Help with errands, meal drop-offs, or friendly check-ins. Exact location shown after sign in.
                </div>
              </article>

              <article className={styles.previewCard}>
                <div className={styles.previewTop}>
                  <div className={styles.previewTitle}>Remote Mentoring</div>
                  <div className={styles.previewMeta}>Remote · Weekly</div>
                </div>
                <div className={styles.previewBody}>
                  Support learners with tutoring or career guidance. Match by skills and availability.
                </div>
              </article>

              <article className={styles.previewCard}>
                <div className={styles.previewTop}>
                  <div className={styles.previewTitle}>Community Events</div>
                  <div className={styles.previewMeta}>Weekend · Team</div>
                </div>
                <div className={styles.previewBody}>
                  Join organized event shifts. You’ll see host details, check-in flows, and required docs after sign in.
                </div>
              </article>
            </div>
          </div>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What you get after signing in</h2>
          <div className={styles.features}>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Verified partners</div>
              <div className={styles.featureBody}>
                Work with organizations and individuals who complete onboarding and platform checks.
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Clear expectations</div>
              <div className={styles.featureBody}>
                See requirements, documents, and scheduling details before you commit.
              </div>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>Track your impact</div>
              <div className={styles.featureBody}>
                Log hours, outcomes, and reviews so your contributions are recognized.
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How it works</h2>
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNum}>1</div>
              <div>
                <div className={styles.stepTitle}>Create an account</div>
                <div className={styles.stepBody}>Sign up with email and verify your account.</div>
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>2</div>
              <div>
                <div className={styles.stepTitle}>Complete onboarding</div>
                <div className={styles.stepBody}>Add profile and availability so we can match you well.</div>
              </div>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNum}>3</div>
              <div>
                <div className={styles.stepTitle}>Apply & coordinate</div>
                <div className={styles.stepBody}>Apply to opportunities, message, schedule, and track completion.</div>
              </div>
            </div>
          </div>

          <div className={styles.noteBox}>
            <div className={styles.noteTitle}>Posting requests?</div>
            <div className={styles.noteBody}>
              Organizations can post opportunities and manage volunteers after signing in and completing onboarding.
            </div>
            <div className={styles.noteActions}>
              <Link className={styles.smallCta} href="/signup">
                Get started
              </Link>
              <Link className={styles.textLink} href="/organizations">
                Learn about partners →
              </Link>
            </div>
          </div>
        </section>
      </section>
    );
  }

  const orgParamRaw = searchParams?.org;
  const org = Array.isArray(orgParamRaw) ? orgParamRaw[0] : orgParamRaw;
  const qs = org ? `?org=${encodeURIComponent(org)}` : "";

  if (me.role === "volunteer") redirect("/volunteer/opportunities/recommended");

  const isPlatformAdmin = Boolean((me as any).is_platform_admin);

  if (me.role === "requester" || me.role === "org_admin" || isPlatformAdmin) {
    const res = await backendFetch(`/v1/public/opportunities${qs}`, { method: "GET" });
    const opportunities = res.ok ? ((await res.json()) as any[]) : [];

    const backHref = isPlatformAdmin ? "/admin" : me.role === "org_admin" ? "/org/requests" : "/requester/dashboard";

    return (
      <section className={styles.page}>
        <header className={styles.authedHeader}>
          <div>
            <div className={styles.kicker}>Volunteer Opportunities</div>
            <h1 className={styles.authedTitle}>Active opportunities</h1>
            <p className={styles.subtitle}>Browse what’s available across the platform.</p>
          </div>

          <div className={styles.authedActions}>
            <Link className={styles.secondaryCta} href={backHref}>
              Back to Requests
            </Link>
          </div>
        </header>

        {res.ok ? null : (
          <div className={styles.errorBox} role="alert">
            Couldn&apos;t load opportunities (HTTP {res.status}).
          </div>
        )}

        {res.ok && opportunities.length === 0 ? (
          <div className={styles.noteBox}>
            <div className={styles.noteTitle}>No opportunities found</div>
            <div className={styles.noteBody}>Check back later as organizations and requesters post new opportunities.</div>
          </div>
        ) : null}

        <div className={styles.opportunityGrid} aria-label="Active opportunities">
          {opportunities.map((o: any) => {
            const id = encodeURIComponent(String(o.id));
            const detailsHref = `/opportunities/${id}`;
	            const applyHref = `/opportunities/${id}#apply`;

            return (
              <article key={o.id} className={styles.opportunityCard}>
                <div className={styles.opportunityTop}>
                  <Link href={detailsHref} className={styles.opportunityTitleLink}>
                    <div className={styles.opportunityTitle}>{String(o.title || "Opportunity")}</div>
                  </Link>
                  <div className={styles.opportunityMeta}>
                    {String(o.mode || "remote")} · {String(o.location || "—")}
                  </div>
                </div>
                <div className={styles.opportunityBody}>{String(o.summary || "")}</div>
                <div className={styles.opportunityFoot}>
                  Updated {o.updated_at ? new Date(String(o.updated_at)).toLocaleDateString() : "—"}
                </div>
                <div className={styles.opportunityActions}>
                  <Link className={styles.actionPrimary} href={detailsHref}>
                    View details
                  </Link>
                </div>
              </article>
            );
          })}
	        </div>
      </section>
    );
  }

  redirect("/dashboard");
}



