import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ShieldCheck, EyeOff, MessageSquareLock, Siren } from "lucide-react";
import { getPublicPage, listPublicOpportunities } from "../lib/public-api";
import OpportunityRow from "../components/opportunities/OpportunityRow";
import { buttonClass } from "../components/ui/Button";

// Rebuilt at most once a minute (ISR).
export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: "ThankYou — volunteer with neighbors and nonprofits" },
  alternates: { canonical: "/" }
};

const AUDIENCES = [
  {
    title: "Volunteers",
    body: "Pick work that fits your skills and your week — a Saturday shift nearby, or an hour of tutoring from home. Track your hours and what you made possible.",
    href: "/signup",
    cta: "Start volunteering"
  },
  {
    title: "Neighbors who need a hand",
    body: "Ask for help with groceries, forms, rides or tech. Your address stays private until you accept someone, and you can message without sharing your number.",
    href: "/signup",
    cta: "Ask for help"
  },
  {
    title: "Organizations",
    body: "Post shifts and projects, review applicants, take attendance and export hours. Verified organizations get a badge volunteers can trust.",
    href: "/org/signup",
    cta: "Register your organization"
  }
];

const STEPS = [
  ["Find something that fits", "Search by place, schedule or skill. Remote work shows up for everyone."],
  ["Apply with a short note", "Say why you're a good fit. The requester reviews and accepts."],
  ["Coordinate safely", "Message inside ThankYou. The exact address is shared only after you're accepted."],
  ["Say thank you", "Mark it complete and leave each other a review. Your impact log updates itself."]
];

const SAFETY = [
  { icon: EyeOff, text: "Addresses and contact details stay hidden until a match is accepted." },
  { icon: MessageSquareLock, text: "Message in the app; block or report anyone in one step." },
  { icon: ShieldCheck, text: "Organizations are reviewed before they get a verified badge." },
  { icon: Siren, text: "ThankYou isn't for emergencies. If someone is in danger, call your local emergency number." }
];

export default async function Home() {
  const [cms, list] = await Promise.all([getPublicPage("home"), listPublicOpportunities({ limit: 5 })]);
  const intro =
    cms?.body?.split("\n")[0]?.trim() ||
    "Find flexible volunteer opportunities, offer help to your community, and track your impact — all in one place.";

  return (
    <div className="grid gap-20 pt-4">
      <section className="grid items-start gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="m-0 max-w-[14ch] text-3xl font-extrabold sm:text-4xl">Help that fits your week.</h1>
          <p className="mt-5 max-w-[46ch] text-lg text-muted">{intro}</p>

          <form action="/opportunities" method="get" role="search" className="mt-8 rounded-md border border-line bg-surface p-3">
            <label htmlFor="home-q" className="sr-only">
              What would you like to help with?
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="home-q"
                name="q"
                placeholder="Tutoring, food bank, rides…"
                className="h-12 min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 text-base"
              />
              <button type="submit" className={buttonClass("primary", "lg")}>
                Find opportunities
              </button>
            </div>
            <fieldset className="m-0 mt-3 flex flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">Where</legend>
              {[
                ["", "Anywhere"],
                ["in-person", "In person"],
                ["remote", "Remote"]
              ].map(([value, label]) => (
                <label key={value} className="cursor-pointer">
                  <input type="radio" name="mode" value={value} defaultChecked={value === ""} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-line-strong px-3 py-1 text-sm text-muted peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:shadow-[var(--focus)]">
                    {label}
                  </span>
                </label>
              ))}
            </fieldset>
          </form>

          <p className="mt-5 text-sm text-muted">
            Need help yourself?{" "}
            <Link href="/signup" className="font-medium text-primary underline underline-offset-4">
              Post a request
            </Link>{" "}
            · Running a nonprofit?{" "}
            <Link href="/org/signup" className="font-medium text-primary underline underline-offset-4">
              Register your organization
            </Link>
          </p>
        </div>

        <section aria-labelledby="open-now" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="open-now" className="m-0 text-lg">
              Open right now
            </h2>
            <Link href="/opportunities" className="text-sm font-medium text-primary">
              See all
            </Link>
          </div>
          {list.items.length ? (
            <ul className="m-0 mt-2 p-0">
              {list.items.map((o) => (
                <OpportunityRow key={o.id} o={o} href={`/opportunities/${o.id}`} compact />
              ))}
            </ul>
          ) : (
            <p className="text-muted">New opportunities are posted every day. Check back soon.</p>
          )}
        </section>
      </section>

      <section aria-labelledby="who" className="grid gap-8">
        <h2 id="who" className="m-0 text-2xl">
          One place for everyone who helps
        </h2>
        <div className="grid gap-10 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <div key={a.title} className="border-t-2 border-ink pt-4">
              <h3 className="m-0 text-lg">{a.title}</h3>
              <p className="mt-2 text-muted">{a.body}</p>
              <Link href={a.href} className="inline-flex items-center gap-1.5 font-medium text-primary">
                {a.cta} <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="how" className="grid gap-8 lg:grid-cols-[1fr_2fr]">
        <div>
          <h2 id="how" className="m-0 text-2xl">
            How it works
          </h2>
          <p className="mt-3 text-muted">From finding a match to saying thanks, everything happens in one place.</p>
          <Link href="/how-it-works" className="font-medium text-primary">
            Read the details
          </Link>
        </div>
        <ol className="m-0 grid gap-6 p-0 sm:grid-cols-2">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex list-none gap-4">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sun font-display text-sm font-bold text-ink">
                {i + 1}
              </span>
              <div>
                <h3 className="m-0 text-base">{title}</h3>
                <p className="m-0 mt-1 text-sm text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="safety" className="rounded-lg bg-ink px-6 py-10 text-white sm:px-10">
        <h2 id="safety" className="m-0 text-2xl text-white">
          Safety comes first
        </h2>
        <ul className="m-0 mt-6 grid gap-5 p-0 sm:grid-cols-2">
          {SAFETY.map(({ icon: Icon, text }) => (
            <li key={text} className="flex list-none gap-3 text-[0.95rem] text-white/90">
              <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-sun" />
              {text}
            </li>
          ))}
        </ul>
        <Link href="/trust-safety" className="mt-6 inline-block font-medium text-white underline underline-offset-4 hover:text-sun">
          How we keep people safe
        </Link>
      </section>
    </div>
  );
}
