import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, ShieldCheck, EyeOff, MessageSquareLock, Siren } from "lucide-react";
import { getPublicPage } from "../lib/public-api";
import { buttonClass } from "../components/ui/Button";

// Rebuilt at most once a minute (ISR).
export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: "Volunteer Services — volunteer with neighbors and nonprofits" },
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

const ORG_POINTS = [
  "Post one-time shifts, recurring roles or goals like 200 meals",
  "Review applicants, accept or waitlist in one click",
  "Check-in codes, attendance and approved hours in one place",
  "A verified badge volunteers trust"
];

const VOLUNTEER_POINTS = [
  "Matches based on your skills, schedule and distance",
  "In person nearby or remote from home",
  "Your address and number stay private"
];

const STEPS = [
  ["Find something that fits", "Search by place, schedule or skill. Remote work shows up for everyone."],
  ["Apply with a short note", "Say why you're a good fit. The requester reviews and accepts."],
  ["Coordinate safely", "Message inside Volunteer Services. The exact address is shared only after you're accepted."],
  ["Say thank you", "Mark it complete and leave each other a review. Your impact log updates itself."]
];

const SAFETY = [
  { icon: EyeOff, text: "Addresses and contact details stay hidden until a match is accepted." },
  { icon: MessageSquareLock, text: "Message in the app; block or report anyone in one step." },
  { icon: ShieldCheck, text: "Organizations are reviewed before they get a verified badge." },
  { icon: Siren, text: "Volunteer Services isn't for emergencies. If someone is in danger, call your local emergency number." }
];

export default async function Home() {
  const cms = await getPublicPage("home");
  const intro =
    cms?.body?.split("\n")[0]?.trim() ||
    "Find flexible volunteer opportunities, offer help to your community, and track your impact — all in one place.";

  return (
    <div className="grid gap-20 pt-4">
      <section className="grid gap-6">
        <div>
          <h1 className="m-0 text-3xl font-extrabold sm:text-4xl">Help that fits your week.</h1>
          <p className="mt-4 max-w-[60ch] text-lg text-muted">{intro}</p>
        </div>

        <div className="grid items-stretch gap-6 lg:grid-cols-2">
          <section aria-labelledby="for-orgs" className="flex flex-col rounded-lg border border-line bg-surface p-6 sm:p-8">
            <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">For organizations</p>
            <h2 id="for-orgs" className="m-0 mt-2 text-2xl">
              Bring dependable volunteers to your cause
            </h2>
            <p className="m-0 mt-3 text-muted">
              Post shifts and projects in minutes, choose from people whose reviews and reliability you can see, and keep every
              hour on record. Free for nonprofits, schools and community groups.
            </p>
            <ul className="m-0 mt-5 grid gap-2.5 p-0">
              {ORG_POINTS.map((t) => (
                <li key={t} className="flex list-none items-start gap-2.5">
                  <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-auto grid gap-3 pt-7 sm:grid-cols-2">
              <Link prefetch={false} href="/signup" className="grid gap-0.5 rounded-md border border-line-strong px-4 py-3 no-underline hover:border-primary">
                <span className="text-sm text-muted">Need help yourself?</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                  Post a request <ArrowRight aria-hidden className="h-4 w-4" />
                </span>
              </Link>
              <Link prefetch={false} href="/org/signup" className="grid gap-0.5 rounded-md bg-primary px-4 py-3 no-underline hover:bg-primary-hover">
                <span className="text-sm text-white/85">Running a nonprofit?</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                  Register your organization <ArrowRight aria-hidden className="h-4 w-4" />
                </span>
              </Link>
            </div>
          </section>

          <section aria-labelledby="for-volunteers" className="flex flex-col rounded-lg bg-primary-tint p-6 sm:p-8">
            <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">For volunteers</p>
            <h2 id="for-volunteers" className="m-0 mt-2 text-2xl">
              Give an hour. See the difference.
            </h2>
            <p className="m-0 mt-3 text-muted">
              Sort a food pantry on Saturday, tutor a student from home, or drive a neighbor to an appointment. Pick what fits
              your skills and schedule — and get a verified record of every hour you give.
            </p>
            <ul className="m-0 mt-5 grid gap-2.5 p-0">
              {VOLUNTEER_POINTS.map((t) => (
                <li key={t} className="flex list-none items-start gap-2.5">
                  <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-7">
              <Link prefetch={false} href="/opportunities" className={buttonClass("primary", "lg")}>
                Find opportunities <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <p className="m-0 mt-3 text-sm text-muted">
                New here?{" "}
                <Link prefetch={false} href="/signup" className="font-medium text-primary underline underline-offset-4">
                  Create a free account
                </Link>{" "}
                to apply, save opportunities and track your hours.
              </p>
            </div>
          </section>
        </div>
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
              <Link prefetch={false} href={a.href} className="inline-flex items-center gap-1.5 font-medium text-primary">
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
          <Link prefetch={false} href="/how-it-works" className="font-medium text-primary">
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
        <Link prefetch={false} href="/trust-safety" className="mt-6 inline-block font-medium text-white underline underline-offset-4 hover:text-sun">
          How we keep people safe
        </Link>
      </section>
    </div>
  );
}
