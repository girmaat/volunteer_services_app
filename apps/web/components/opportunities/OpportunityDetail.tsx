import Link from "next/link";
import { AlertCircle, Bookmark, BookmarkCheck, CalendarClock, Lock, MapPin, Monitor, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button, ButtonLink, Card, Notice, StatusPill, VerifiedBadge } from "../ui";
import { WhenText, modeText, type OpportunitySummary } from "./OpportunityRow";

export type OpportunityDetailData = OpportunitySummary & {
  description: string;
  duration_minutes: number | null;
  accessibility_notes: string | null;
  equipment_notes: string | null;
  min_age: number | null;
  requires_background_check: boolean;
  requires_training: boolean;
  requires_waiver: boolean;
  requires_car: boolean;
  required_skills: string[];
  nice_to_have_skills: string[];
  volunteers_needed: number;
  organization_slug: string | null;
  exact_address: string | null;
  address_hidden: boolean;
  is_sensitive: boolean;
  status: string;
  application: { id: string; status: string; message: string | null; created_at: string } | null;
  saved: boolean;
  can_apply: boolean;
  eligibility: { code: string; message: string }[];
};

type Viewer = "anon" | "volunteer" | "member"; // member = signed in without the volunteer role

/**
 * Opportunity page for everyone. Volunteers see eligibility, apply, save and (after acceptance) the
 * exact address; others get a sign-up / add-role prompt.
 */
export default function OpportunityDetail({
  o,
  viewer,
  viewerTz,
  returnTo,
  applyAction,
  saveAction,
  flash,
  error
}: {
  o: OpportunityDetailData;
  viewer: Viewer;
  viewerTz?: string | null;
  returnTo: string;
  applyAction?: (fd: FormData) => Promise<void>;
  saveAction?: (fd: FormData) => Promise<void>;
  flash?: string;
  error?: string;
}) {
  const requirements = [
    o.min_age ? `${o.min_age}+ years old` : null,
    o.requires_car ? "Has a car" : null,
    o.requires_background_check ? "Cleared background check" : null,
    o.requires_training ? "Training before the first shift" : null,
    o.requires_waiver ? "Signs a waiver" : null
  ].filter(Boolean) as string[];

  return (
    <article className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="grid content-start gap-6">
        <header>
          <p className="m-0 text-sm text-muted">
            {o.category_label}
            {o.is_sensitive ? " · verified volunteers only" : ""}
          </p>
          <h1 className="m-0 mt-1 text-2xl sm:text-3xl">{o.title}</h1>
          <p className="m-0 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            <span className="inline-flex items-center gap-1.5">
              {o.mode === "remote" ? <Monitor aria-hidden className="h-4 w-4" /> : <MapPin aria-hidden className="h-4 w-4" />}
              {o.mode === "remote" ? "Remote" : `${o.public_area || modeText(o.mode)}${o.mode === "hybrid" ? " · hybrid" : ""}`}
              {o.distance_miles != null ? ` · ${o.distance_miles} mi away` : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {o.organization_slug ? (
                <Link href={`/organizations/${o.organization_slug}`} className="text-muted underline">
                  {o.posted_by}
                </Link>
              ) : (
                o.posted_by
              )}
              {o.organization_verified ? <VerifiedBadge /> : null}
            </span>
          </p>
        </header>

        {flash === "applied" ? <Notice tone="success">Application sent. We&apos;ll let you know when the organizer replies.</Notice> : null}
        {flash === "saved" ? <Notice tone="success">Saved to your list.</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}

        {o.match && o.match.reasons.length ? (
          <p className="m-0 inline-flex items-center gap-2 text-primary">
            <Sparkles aria-hidden className="h-4 w-4" /> Why it matches you: {o.match.reasons.join(" · ")}
          </p>
        ) : null}

        <section aria-labelledby="about-h">
          <h2 id="about-h" className="m-0 mb-2 text-lg">
            About
          </h2>
          <p className="m-0 max-w-[70ch] whitespace-pre-line leading-relaxed">{o.description}</p>
        </section>

        {o.required_skills.length || o.nice_to_have_skills.length ? (
          <section aria-labelledby="skills-h">
            <h2 id="skills-h" className="m-0 mb-2 text-lg">
              Skills
            </h2>
            <ul className="m-0 flex flex-wrap gap-2 p-0">
              {o.required_skills.map((s) => (
                <li key={s} className="list-none rounded-full border border-line-strong px-3 py-1 text-sm">
                  {s}
                </li>
              ))}
              {o.nice_to_have_skills.map((s) => (
                <li key={s} className="list-none rounded-full border border-dashed border-line-strong px-3 py-1 text-sm text-muted">
                  {s} <span className="sr-only">(nice to have)</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {requirements.length || o.equipment_notes || o.accessibility_notes ? (
          <section aria-labelledby="req-h">
            <h2 id="req-h" className="m-0 mb-2 text-lg">
              Before you apply
            </h2>
            {requirements.length ? (
              <ul className="m-0 grid gap-1 pl-5">
                {requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            {o.equipment_notes ? <p className="m-0 mt-2"><span className="font-medium">Bring:</span> {o.equipment_notes}</p> : null}
            {o.accessibility_notes ? <p className="m-0 mt-2"><span className="font-medium">Access:</span> {o.accessibility_notes}</p> : null}
          </section>
        ) : null}

        <p className="m-0 flex items-start gap-2 text-sm text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          Coordinate in ThankYou messages. Never share bank details or passwords, and meet in a public place the first time when you can.
        </p>
      </div>

      <aside aria-label="Details and apply" className="grid content-start gap-4">
        <Card className="grid gap-3">
          <p className="m-0 flex items-start gap-2">
            <CalendarClock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span>
              <WhenText o={o} viewerTz={viewerTz} />
              {o.duration_minutes ? <span className="text-muted"> · about {Math.round(o.duration_minutes / 6) / 10} h</span> : null}
            </span>
          </p>
          <p className="m-0 flex items-start gap-2">
            <Users aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <span>
              {o.volunteers_needed} volunteer{o.volunteers_needed === 1 ? "" : "s"} needed
              {typeof o.spots_left === "number" ? <span className="text-muted"> · {o.spots_left === 0 ? "full, waitlist open" : `${o.spots_left} left`}</span> : null}
            </span>
          </p>
          <p className="m-0 flex items-start gap-2">
            <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            {o.exact_address ? (
              <span>
                <span className="font-medium">{o.exact_address}</span>
                <span className="block text-sm text-muted">Shared with you because you were accepted.</span>
              </span>
            ) : (
              <span className="text-sm text-muted">
                {o.mode === "remote" ? "Contact details are shared after you're accepted." : "The exact address and contact details are shared after you're accepted."}
              </span>
            )}
          </p>
        </Card>

        {viewer === "anon" ? (
          <Card className="grid gap-3">
            <p className="m-0 font-medium">Want to help?</p>
            <ButtonLink href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>Create an account to apply</ButtonLink>
            <ButtonLink href={`/login?returnTo=${encodeURIComponent(returnTo)}`} variant="secondary">
              Log in
            </ButtonLink>
          </Card>
        ) : null}

        {viewer === "member" ? (
          <Card className="grid gap-3">
            <p className="m-0 text-sm">Add the volunteer role to your account to apply. Your other roles stay as they are.</p>
            <form action="/api/roles" method="post">
              <input type="hidden" name="role" value="volunteer" />
              <Button type="submit" className="w-full">
                Add volunteer role
              </Button>
            </form>
          </Card>
        ) : null}

        {viewer === "volunteer" ? (
          <Card className="grid gap-3" id="apply">
            {o.application ? (
              <>
                <p className="m-0 flex items-center justify-between gap-2">
                  <span className="font-medium">Your application</span>
                  <StatusPill status={o.application.status} />
                </p>
                <ButtonLink href={`/volunteer/applications/${o.application.id}`} variant="secondary">
                  Open application
                </ButtonLink>
              </>
            ) : o.can_apply && applyAction ? (
              <form action={applyAction} className="grid gap-2">
                <label htmlFor="apply-msg" className="text-sm font-medium">
                  Message to the organizer
                </label>
                <textarea
                  id="apply-msg"
                  name="message"
                  required
                  maxLength={2000}
                  placeholder="Say hello, when you're free, and any relevant experience."
                  className="min-h-[110px] w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm"
                />
                <Button type="submit">{o.spots_left === 0 ? "Join the waitlist" : "Apply"}</Button>
              </form>
            ) : (
              <div className="grid gap-2">
                <p className="m-0 font-medium">You can&apos;t apply yet</p>
                <ul className="m-0 grid gap-1.5 p-0">
                  {o.eligibility.map((p) => (
                    <li key={p.code} className="flex list-none items-start gap-2 text-sm">
                      <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {p.message}
                    </li>
                  ))}
                </ul>
                <Link href="/volunteer/profile" className="text-sm font-medium text-primary">
                  Update your profile
                </Link>
              </div>
            )}
            {saveAction ? (
              <form action={saveAction}>
                <input type="hidden" name="saved" value={o.saved ? "1" : ""} />
                <Button type="submit" variant="ghost" size="sm" icon={o.saved ? <BookmarkCheck aria-hidden className="h-4 w-4" /> : <Bookmark aria-hidden className="h-4 w-4" />}>
                  {o.saved ? "Saved" : "Save for later"}
                </Button>
              </form>
            ) : null}
          </Card>
        ) : null}
      </aside>
    </article>
  );
}
