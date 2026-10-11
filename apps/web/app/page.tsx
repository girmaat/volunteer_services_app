import styles from "./page.module.css";
import Link from "next/link";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const dynamic = "force-dynamic";

type PublicPage = {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
};

async function getPage(): Promise<PublicPage> {
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/home`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load page");
  return res.json();
}

type PublicOpportunityListItem = {
  id: string;
  title: string;
  tags: string[] | null;
};

async function getPublicOpportunities(): Promise<PublicOpportunityListItem[]> {
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/opportunities`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as any[];
  return data.map((o) => ({
    id: String(o.id),
    title: String(o.title || "Opportunity"),
    tags: Array.isArray(o.tags) ? (o.tags as any[]).map((t) => String(t)) : null
  }));
}

type QuickIdeaGroup = {
  title: string;
  items: string[];
};

/**
 * Curated ideas to inspire first‑time volunteers and requesters.
 * These are shown even when there are no public opportunities yet.
 */
const QUICK_IDEA_GROUPS: QuickIdeaGroup[] = [
  {
    title: "Conversation & learning",
    items: [
      "Walk and talk",
      "Board games / conversation",
      "Senior book reading",
      "Math homework support",
      "Reading practice",
      "College / job application review",
      "Explain a bill",
      "Help complete online forms"
    ]
  },
  {
    title: "Errands & community",
    items: [
      "Grocery pickup",
      "Pharmacy run",
      "Ride to an appointment",
      "Pack donation boxes",
      "Park litter pickup",
      "Light weeding",
      "Community garden help"
    ]
  }
];

const fallbackExampleTitles: string[] = [
  "Help a senior set up a new phone and learn video calls",
  "Pack food pantry boxes for families this weekend",
  "Neighborhood park cleanup: litter pickup and light weeding",
  "Tutor a student for an hour (math or reading)",
  "Drive a neighbor to a medical appointment",
  "Review a resume and practice interview questions"
];

export default async function Page() {
  const [page, opportunities] = await Promise.all([getPage(), getPublicOpportunities()] as const);

  const exampleOpps: PublicOpportunityListItem[] = opportunities.slice(0, 6);

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.kicker}>Volunteer • Request help • Measure impact</div>
          <h1 className={styles.title}>{page.title}</h1>
          <p className={styles.subtitle}>{page.body}</p>

          <div className={styles.ctaRow}>
            <Link className={styles.primaryCta} href="/opportunities">
              Browse opportunities
            </Link>
            <Link className={styles.secondaryCta} href="/signup">
              Create a free account
            </Link>
          </div>
        </div>

        <div className={styles.heroCard} aria-label="Highlights">
          <div className={styles.stat}>
            <div className={styles.statValue}>Fast matching</div>
            <div className={styles.statLabel}>Find nearby or remote opportunities in seconds.</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>Built-in coordination</div>
            <div className={styles.statLabel}>Apply, message, schedule, and complete in one flow.</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>Real outcomes</div>
            <div className={styles.statLabel}>Track hours, impact, reviews, and reputation.</div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.h2}>Built for everyone who wants to help</h2>

        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <h3 className={styles.h3}>Volunteers</h3>
            <ul className={styles.list}>
              <li>Browse by location, tags, or remote options</li>
              <li>Apply in minutes and chat with requesters</li>
              <li>Track hours, badges, and impact over time</li>
            </ul>
          </div>

          <div className={styles.card}>
            <h3 className={styles.h3}>Individuals requesting help</h3>
            <ul className={styles.list}>
              <li>Post a request and review applicants</li>
              <li>Coordinate details with secure messaging</li>
              <li>Leave reviews once the request is completed</li>
            </ul>
          </div>

          <div className={styles.card}>
            <h3 className={styles.h3}>Organizations</h3>
            <ul className={styles.list}>
              <li>Manage team members, roles, and invites</li>
              <li>Track attendance, documents, and incidents</li>
              <li>Export rosters and hours for reporting</li>
            </ul>
          </div>
        </div>
      </div>

      
      <div className={styles.section}>
        <div className={styles.cardGrid}>
          <div className={`${styles.card} ${styles.inspireCard}`} aria-label="Local volunteer inspiration">
            <div className={styles.inspireText}>
              Someone nearby needs help more than you realize—and you’re closer than you think.
            </div>
          </div>
        </div>
      </div>

<div className={styles.section}>
        <h2 className={styles.h2}>Ways you can help</h2>

        <div className={styles.cardGrid}>
          <div className={`${styles.card} ${styles.quickIdeasCard}`}>
            <h3 className={styles.h3}>Quick ideas (with examples)</h3>
            <p className={styles.cardText}>
              A few concrete requests that match common skills — great for first‑time volunteers.
            </p>

            <div className={styles.ideaColumns} aria-label="Help ideas">
              {QUICK_IDEA_GROUPS.map((group) => (
                <div key={group.title} className={styles.ideaColumn}>
                  <div className={styles.ideaColumnTitle}>{group.title}</div>
                  <ul className={styles.ideaBullets}>
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className={styles.examplesFooter}>
              <Link className={styles.examplesCta} href="/examples">
                More volunteer ideas →
              </Link>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.h3}>Examples you can join</h3>

            {exampleOpps.length ? (
              <ul className={styles.examplesList}>
                {exampleOpps.map((opp) => (
                  <li key={opp.id}>
                    <Link href={`/opportunities/${encodeURIComponent(opp.id)}`}>{opp.title}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={styles.examplesList} aria-label="Sample opportunities">
                {fallbackExampleTitles.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}

            <div className={styles.examplesFooter}>
              <Link className={styles.examplesCta} href="/examples">
                More examples to join →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.callout}>
        <div className={styles.calloutInner}>
          <h2 className={styles.h2}>Trust &amp; Safety, built in</h2>
          <ul className={styles.list}>
            <li>Verification workflows for users and organizations</li>
            <li>Reporting, blocking, and admin moderation tools</li>
            <li>Privacy controls for profile visibility and messaging</li>
          </ul>

          <div className={styles.calloutCtas}>
            <Link className={styles.secondaryCta} href="/trust-safety">
              Learn about Trust &amp; Safety
            </Link>
            <Link className={styles.secondaryCta} href="/code-of-conduct">
              Read the Code of Conduct
            </Link>
          </div>
        </div>
      </div>

      <div className={styles.finalCta}>
        <h2 className={styles.h2}>Ready to get started?</h2>
        <p className={styles.muted}>Browse opportunities now, or create an account to apply, message, and track your impact.</p>

        <div className={styles.ctaRow}>
          <Link className={styles.primaryCta} href="/opportunities">
            Explore opportunities
          </Link>
          <Link className={styles.secondaryCta} href="/signup">
            Sign up
          </Link>
          <Link className={styles.secondaryCta} href="/contact">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}