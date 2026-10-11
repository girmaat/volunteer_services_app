import styles from "./page.module.css";
import Link from "next/link";
import { API_BASE_URL_SERVER } from "@helpers/shared-config";

export const dynamic = "force-dynamic";

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
    tags: Array.isArray(o.tags) ? (o.tags as any[]).map((t) => String(t)) : null,
  }));
}

type HelpIdea = {
  label: string;
  blurb: string;
  examples: string[];
};

const HELP_IDEAS: HelpIdea[] = [
  {
    label: "Tech & devices",
    blurb: "Help someone get unstuck with phones, tablets, or computers.",
    examples: ["Set up email and apps", "Video calls + accessibility", "Wi‑Fi / printer troubleshooting"],
  },
  {
    label: "Tutoring & mentoring",
    blurb: "Share knowledge — from homework help to career coaching.",
    examples: ["Math / reading practice", "Resume review & interview prep", "Language conversation buddy"],
  },
  {
    label: "Errands & logistics",
    blurb: "A small trip can make a big difference for someone else.",
    examples: ["Grocery pickup or delivery", "Pharmacy runs", "Ride coordination (non‑medical)"],
  },
  {
    label: "Food & community support",
    blurb: "Support food programs and neighbors who need a hand.",
    examples: ["Sort & pack pantry boxes", "Meal drop‑offs", "Community fridge restocking"],
  },
  {
    label: "Home & yard help",
    blurb: "Light help around the house that’s hard to do alone.",
    examples: ["Lawn / leaf cleanup", "Small repairs or organizing", "Moving a few items (light)"],
  },
  {
    label: "Companionship",
    blurb: "Sometimes the most valuable help is showing up consistently.",
    examples: ["Friendly check‑ins", "Reading together", "Walks and conversation"],
  },
  {
    label: "Events & volunteering shifts",
    blurb: "Join a team for time‑boxed, well‑defined roles.",
    examples: ["Check‑in & greeting", "Setup / teardown", "Crowd support & directions"],
  },
  {
    label: "Admin & paperwork",
    blurb: "Make life easier with forms, calls, and scheduling.",
    examples: ["Fill forms together", "Make appointments", "Sorting mail & reminders"],
  },
];

const FALLBACK_EXAMPLES = [
  "Help a senior set up a smartphone (email + contacts)",
  "Tutor a student for an upcoming exam (1 hour/week)",
  "Deliver groceries to a neighbor (one‑time)",
  "Sort & pack donations at a local food pantry",
  "Neighborhood park cleanup (litter pickup)",
  "Resume review + mock interview practice",
  "Set up a computer for a new job (accounts + basics)",
  "Organize a closet / small space (1–2 hours)",
  "Translate a short form / letter (conversation level)",
  "Walk a dog for a busy neighbor (recurring)",
  "Assemble care packages for a shelter",
  "Teach basic budgeting or spreadsheets (beginner)",
];

export default async function Page() {
  const opportunities = await getPublicOpportunities();
  const exampleOpps = opportunities.slice(0, 24);

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>More examples to join</h1>
          <p className={styles.subtitle}>
            These are concrete examples of real‑world help. Browse ideas below, then jump into live opportunities when you&apos;re ready.
          </p>
        </div>

        <div className={styles.headerCtas}>
          <Link className={styles.primaryCta} href="/opportunities">
            Browse all opportunities
          </Link>
          <Link className={styles.secondaryCta} href="/signup">
            Create a free account
          </Link>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.h2}>Quick ideas</h2>
          <p className={styles.cardText}>
            Pick a category that matches what you have time for — then choose a specific example to get started.
          </p>

          <div className={styles.ideaGrid} aria-label="Help ideas">
            {HELP_IDEAS.map((idea) => (
              <div key={idea.label} className={styles.ideaTile}>
                <div className={styles.ideaTitle}>{idea.label}</div>
                <div className={styles.ideaBlurb}>{idea.blurb}</div>
                <ul className={styles.ideaList}>
                  {idea.examples.map((ex) => (
                    <li key={ex}>{ex}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.h2}>Examples you can join</h2>
          <p className={styles.cardText}>
            {exampleOpps.length
              ? "These are currently active opportunities across the platform."
              : "No public opportunities are active yet — here are realistic examples that people commonly need."}
          </p>

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
              {FALLBACK_EXAMPLES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}

          <div className={styles.footer}>
            <Link className={styles.secondaryCta} href="/opportunities">
              Browse all opportunities
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
