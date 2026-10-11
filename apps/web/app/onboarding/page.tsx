import Link from "next/link";
import { redirect } from "next/navigation";
import { HandHeart, HeartHandshake, Building2, ArrowRight } from "lucide-react";
import { getCurrentUser, getOnboardingProfile } from "../lib/backend";
import { getCategories } from "../../lib/requests";
import { Button, Card, Notice } from "../../components/ui";
import { ChipGroup, StepProgress, type ChipOption } from "../../components/onboarding/Chips";
import TimezoneSelect from "../../components/onboarding/TimezoneSelect";
import { chooseRole, saveAbout, saveInterests, saveNeeds, saveSchedule } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get started", robots: { index: false } };

type Step = "role" | "about" | "interests" | "schedule" | "needs";

const SKILLS: ChipOption[] = [
  { value: "driving", label: "Driving" },
  { value: "lifting", label: "Lifting & moving" },
  { value: "cooking", label: "Cooking" },
  { value: "handy", label: "Handy with tools" },
  { value: "organizing", label: "Organizing" },
  { value: "spanish", label: "Spanish" },
  { value: "writing", label: "Writing & editing" },
  { value: "gardening", label: "Gardening" },
  { value: "event setup", label: "Event setup" },
  { value: "listening", label: "Good listener" }
];

const CAUSES: ChipOption[] = [
  { value: "seniors", label: "Older adults" },
  { value: "families", label: "Families" },
  { value: "kids", label: "Kids & youth" },
  { value: "food security", label: "Food security" },
  { value: "disability access", label: "Disability access" },
  { value: "newcomers", label: "Newcomers & refugees" },
  { value: "environment", label: "Environment" },
  { value: "animals", label: "Animals" },
  { value: "health", label: "Health" }
];

const DAYS: ChipOption[] = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" }
];

const input = "h-11 w-full rounded border border-line-strong bg-surface px-3 text-base";
const labelCls = "text-sm font-semibold text-ink";

function isOrgUser(u: { role?: string | null; account_type?: string | null }) {
  return u.role === "org_admin" || u.account_type === "org_team_member";
}

export default async function OnboardingPage(props: { searchParams?: Promise<{ step?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/onboarding");
  if (isOrgUser(user)) redirect("/org/onboarding");
  if (user.role === "requester" && (user as { requester_mode?: string }).requester_mode === "organization") redirect("/org/signup");
  if (user.onboarding_completed) redirect("/onboarding/welcome");

  const role = user.role === "volunteer" || user.role === "requester" ? user.role : null;
  // Where they are: explicit step from the flow, else the first unfinished one.
  const wanted = sp.step as Step | undefined;
  let step: Step = !role ? "role" : !user.profile_completed ? "about" : role === "volunteer" ? "schedule" : "needs";
  if (role && wanted && ["about", "interests", "schedule", "needs", "role"].includes(wanted)) step = wanted;
  if (!role) step = "role";

  const [profile, categories] = await Promise.all([role ? getOnboardingProfile() : Promise.resolve(null), getCategories()]);
  const steps = role === "requester" ? ["How you’ll use it", "About you", "What you need"] : ["How you’ll use it", "About you", "Interests", "Schedule"];
  const index = { role: 0, about: 1, interests: 2, needs: 2, schedule: 3 }[step];
  const catOptions: ChipOption[] = categories.filter((c) => !c.is_sensitive && c.slug !== "other").map((c) => ({ value: c.slug, label: c.label, hint: c.description }));

  return (
    <div className="mx-auto max-w-2xl">
      {step !== "role" ? <StepProgress steps={steps} current={index} /> : null}
      {sp.error ? (
        <div className="mb-5">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}

      {step === "role" ? (
        <>
          <h1 className="m-0 font-display text-3xl font-bold">Welcome to ThankYou</h1>
          <p className="m-0 mt-2 text-lg text-muted">How will you use it? You can add the other later.</p>
          <form action={chooseRole} className="mt-8 grid gap-3">
            {[
              { v: "volunteer", t: "I want to help", b: "Find ways to volunteer nearby or remotely, matched to your skills and schedule.", icon: <HandHeart aria-hidden className="h-6 w-6" /> },
              { v: "requester", t: "I need a hand", b: "Ask neighbors for help with errands, rides, tech, company and more. It’s free.", icon: <HeartHandshake aria-hidden className="h-6 w-6" /> },
              { v: "organization", t: "I’m with an organization", b: "Post volunteer opportunities for your nonprofit or community group.", icon: <Building2 aria-hidden className="h-6 w-6" /> }
            ].map((o) => (
              <label
                key={o.v}
                className="flex cursor-pointer items-start gap-4 rounded-lg border border-line-strong bg-surface p-5 hover:border-ink has-[:checked]:border-primary has-[:checked]:bg-primary-tint has-[:focus-visible]:shadow-[var(--focus)]"
              >
                <input type="radio" name="role" value={o.v} required defaultChecked={role === o.v} className="sr-only" />
                <span className="mt-0.5 text-primary">{o.icon}</span>
                <span>
                  <span className="block text-lg font-semibold text-ink">{o.t}</span>
                  <span className="mt-1 block text-muted">{o.b}</span>
                </span>
              </label>
            ))}
            <div className="mt-3">
              <Button type="submit" size="lg">
                Continue <ArrowRight aria-hidden className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </>
      ) : null}

      {step === "about" ? (
        <>
          <h1 className="m-0 font-display text-3xl font-bold">About you</h1>
          <p className="m-0 mt-2 text-muted">Just the basics. People see your first name and neighborhood, never your address or phone.</p>
          <Card className="mt-6 p-6">
            <form action={saveAbout} className="grid gap-5">
              <input type="hidden" name="role" value={role ?? ""} />
              <div className="grid gap-1.5">
                <label htmlFor="ob-name" className={labelCls}>
                  Your name
                </label>
                <input id="ob-name" name="fullName" required autoComplete="name" defaultValue={profile?.full_name || ""} className={input} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="ob-display" className={labelCls}>
                  What should we call you? <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="ob-display" name="displayName" autoComplete="nickname" defaultValue={profile?.display_name || ""} placeholder="Your first name by default" className={input} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="ob-area" className={labelCls}>
                  Neighborhood or ZIP code
                </label>
                <input id="ob-area" name="publicLocation" autoComplete="postal-code" defaultValue={profile?.public_location || ""} placeholder="e.g. Astoria, Queens or 11105" className={input} aria-describedby="ob-area-hint" />
                <p id="ob-area-hint" className="m-0 text-sm text-muted">
                  {role === "volunteer" ? "Used to find opportunities near you." : "Used to find volunteers near you."} Shown only as a general area.
                </p>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="ob-phone" className={labelCls}>
                  Phone <span className="font-normal text-muted">(optional, never shown)</span>
                </label>
                <input id="ob-phone" name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone || ""} className={input} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link prefetch={false} href="/onboarding?step=role" className="text-sm font-medium text-muted">
                  ← Change how I’ll use it
                </Link>
                <Button type="submit" size="lg">
                  Continue <ArrowRight aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      {step === "interests" ? (
        <>
          <h1 className="m-0 font-display text-3xl font-bold">What would you like to help with?</h1>
          <p className="m-0 mt-2 text-muted">Tap anything that fits. This is how we pick opportunities for you. Skip it if you’d rather browse.</p>
          <Card className="mt-6 p-6">
            <form action={saveInterests} className="grid gap-7">
              <ChipGroup name="categories" legend="Kinds of help" options={catOptions} selected={profile?.help_categories || []} />
              <ChipGroup name="skills" legend="Things you’re good at" options={SKILLS} selected={profile?.help_categories || []} />
              <div className="grid gap-1.5">
                <label htmlFor="ob-other" className={labelCls}>
                  Anything else? <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="ob-other" name="otherSkills" placeholder="e.g. sign language, bike repair" className={input} />
              </div>
              <ChipGroup name="causes" legend="Causes you care about" options={CAUSES} selected={profile?.experience_tags || []} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label htmlFor="ob-radius" className={labelCls}>
                    How far will you travel?
                  </label>
                  <select id="ob-radius" name="radius" defaultValue={String(profile?.service_radius_miles || 10)} className={input}>
                    {[2, 5, 10, 15, 25, 50].map((m) => (
                      <option key={m} value={m}>
                        Up to {m} miles
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex cursor-pointer items-center gap-3 self-end rounded border border-line-strong bg-surface px-3 py-2.5 text-sm font-medium has-[:checked]:border-primary">
                  <input type="checkbox" name="hasCar" defaultChecked={Boolean(profile?.has_car)} className="h-5 w-5 accent-[var(--primary)]" />I have a car I can use
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="submit" name="intent" value="skip" formNoValidate className="border-0 bg-transparent p-0 text-sm font-medium text-muted underline">
                  Skip for now
                </button>
                <Button type="submit" name="intent" value="save" size="lg">
                  Continue <ArrowRight aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      {step === "schedule" ? (
        <>
          <h1 className="m-0 font-display text-3xl font-bold">When and how can you help?</h1>
          <p className="m-0 mt-2 text-muted">A rough idea is enough. You can change it any time in your profile.</p>
          <Card className="mt-6 p-6">
            <form action={saveSchedule} className="grid gap-7">
              <ChipGroup name="days" legend="Days that usually work" options={DAYS} selected={["sat", "sun"]} />
              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className="mb-1 p-0 text-base font-semibold text-ink">How</legend>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["inPersonOk", "In person"],
                    ["remoteOk", "Remote (phone or video)"]
                  ].map(([n, l]) => (
                    <label key={n} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-full border border-line-strong bg-surface px-4 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary-tint has-[:checked]:text-primary">
                      <input type="checkbox" name={n} defaultChecked className="h-4 w-4 accent-[var(--primary)]" />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label htmlFor="ob-hours" className={labelCls}>
                    Hours a week
                  </label>
                  <select id="ob-hours" name="hours" defaultValue="2" className={input}>
                    {[
                      [1, "About an hour"],
                      [2, "1–3 hours"],
                      [5, "3–6 hours"],
                      [10, "More than 6 hours"]
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="ob-tz" className={labelCls}>
                    Time zone
                  </label>
                  <TimezoneSelect id="ob-tz" name="timezone" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link prefetch={false} href="/onboarding?step=interests" className="text-sm font-medium text-muted">
                  ← Back
                </Link>
                <Button type="submit" size="lg">
                  Show me opportunities <ArrowRight aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      {step === "needs" ? (
        <>
          <h1 className="m-0 font-display text-3xl font-bold">What do you usually need help with?</h1>
          <p className="m-0 mt-2 text-muted">Optional. It helps us suggest the right kind of request when you ask.</p>
          <Card className="mt-6 p-6">
            <form action={saveNeeds} className="grid gap-7">
              <ChipGroup name="needs" legend="Kinds of help" options={catOptions} selected={profile?.need_categories || []} />
              <div className="grid gap-1.5">
                <label htmlFor="ob-need" className={labelCls}>
                  Anything volunteers should know? <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea id="ob-need" name="needHelpPrompt" maxLength={500} rows={3} placeholder="e.g. I live on a fourth floor without an elevator." className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-base" />
              </div>
              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className="mb-1 p-0 text-base font-semibold text-ink">Comfort and safety</legend>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" name="meetInPublicFirst" className="h-5 w-5 accent-[var(--primary)]" />I’d like to meet in a public place first
                </label>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" name="someoneElsePresent" className="h-5 w-5 accent-[var(--primary)]" />Someone else will usually be with me
                </label>
              </fieldset>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="submit" name="intent" value="skip" formNoValidate className="border-0 bg-transparent p-0 text-sm font-medium text-muted underline">
                  Skip for now
                </button>
                <Button type="submit" name="intent" value="save" size="lg">
                  Finish <ArrowRight aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}
    </div>
  );
}
