import Link from "next/link";
import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { listPublicOpportunities } from "../../lib/public-api";
import OpportunityRow from "../../components/opportunities/OpportunityRow";
import { buttonClass } from "../../components/ui/Button";
import { Card, EmptyState } from "../../components/ui/Card";

export const metadata: Metadata = {
  title: "Ideas for helping",
  description: "Ways to help, from tech support to tutoring, and live opportunities you can join now.",
  alternates: { canonical: "/examples" }
};

export const revalidate = 60;

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

export default async function Page() {
  const { items } = await listPublicOpportunities({ limit: 8 });

  return (
    <div className="mx-auto grid max-w-5xl gap-10 py-4">
      <header className="grid gap-3">
        <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">Ideas for helping</p>
        <h1 className="m-0 text-3xl sm:text-4xl">Not sure where to start?</h1>
        <p className="m-0 max-w-2xl text-lg text-muted">
          Pick the kind of help that fits your skills and your week. Open a category to see examples, then join an opportunity that&apos;s open now.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link prefetch={false} className={buttonClass("primary")} href="/opportunities">
            Browse all opportunities
          </Link>
          <Link prefetch={false} className={buttonClass("secondary")} href="/signup">
            Create a free account
          </Link>
        </div>
      </header>

      <div className="grid gap-10">
        <section aria-labelledby="ideas-h" className="grid content-start gap-3">
          <h2 id="ideas-h" className="m-0 text-xl">
            Quick ideas
          </h2>
          <div className="overflow-hidden rounded-md border border-line bg-surface">
            {HELP_IDEAS.map((idea, i) => (
              <details key={idea.label} className="group border-b border-line last:border-b-0" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 font-semibold hover:bg-wash [&::-webkit-details-marker]:hidden">
                  <span>{idea.label}</span>
                  <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-2 px-4 pb-4">
                  <p className="m-0 text-sm text-muted">{idea.blurb}</p>
                  <ul className="m-0 grid gap-1 pl-5 text-sm">
                    {idea.examples.map((ex) => (
                      <li key={ex}>{ex}</li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="open-h" className="grid content-start gap-3">
          <h2 id="open-h" className="m-0 text-xl">
            Open opportunities right now
          </h2>
          <p className="m-0 text-sm text-muted">Live opportunities you can apply to today.</p>
          {items.length ? (
            <Card className="py-1">
              <ul className="m-0 p-0">
                {items.map((o) => (
                  <OpportunityRow key={o.id} o={{ ...o, public_area: o.location }} href={`/opportunities/${encodeURIComponent(o.id)}`} compact />
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState title="Nothing open right now" body="New opportunities are posted every week. Check back soon." />
          )}
          <Link prefetch={false} className="inline-flex w-fit font-semibold text-primary underline" href="/opportunities">
            See all opportunities
          </Link>
        </section>
      </div>
    </div>
  );
}
