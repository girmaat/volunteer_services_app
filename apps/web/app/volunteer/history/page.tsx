import Link from "next/link";
import { Award, BadgeCheck, Clock, Download, MessageSquareQuote, NotebookPen, Star } from "lucide-react";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { zoneOr } from "../../../lib/time";
import ShareButton from "../../_components/share/ShareButton";
import { Button, ButtonLink, EmptyState, Notice, PageHeader, StatStrip, StatusPill, SubmitButton, Toast } from "../../../components/ui";
import { disputeAction, outsideAction, reportAction, resubmitAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impact" };

type Contribution = {
  id: string;
  status: string;
  source: string;
  method_label: string;
  started_at: string | null;
  ended_at: string | null;
  reported_hours: number | null;
  approved_hours: number | null;
  reported_units: number | null;
  approved_units: number | null;
  unit: string | null;
  description: string | null;
  last_reason: string | null;
};
type Work = {
  application_id: string;
  request_id: string;
  title: string;
  organization_name: string | null;
  requester_name: string | null;
  application_status: string;
  completed_at: string;
  hours: number;
  pending_hours: number;
  contributions: Contribution[];
};
type Badge = { id: string; title: string; description: string; earned: boolean; earned_at: string | null; progress: number; goal: number };
type Impact = {
  totals: { hours: number; pending_hours: number; self_reported_hours: number; units: { unit: string; approved: number; pending: number }[]; completed: number; organizations: number; people: number; badges: number };
  timeline: Work[];
  outside: { id: string; status: string; started_at: string | null; hours: number | null; text: string | null; created_at: string }[];
  badges: Badge[];
  reviews: { count: number; average: number | null; latest: { rating: number; comment: string | null; created_at: string; request_title: string | null; reviewer_name: string }[] };
};

const FLASH: Record<string, string> = {
  reported: "Sent for approval. It counts once the organizer approves it.",
  outside: "Saved as self-reported.",
  resubmitted: "Sent back for approval.",
  disputed: "Dispute sent. Someone who wasn’t part of the decision will look at it."
};

// Dates and times show in the volunteer's own time zone (from their availability).
const day = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
const time = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
const hrs = (n: number | null | undefined) => `${Math.round((n ?? 0) * 100) / 100} h`;
const field = "h-10 rounded border border-line-strong bg-surface px-3 font-normal";

/** Date + start/end, or just hours. Shared by reporting, resubmitting and outside service. */
function TimeInputs({ prefix, tz }: { prefix: string; tz: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <input type="hidden" name="tz" value={tz} />
      <label className="grid gap-1 text-sm font-medium">
        Date
        <input name="date" type="date" className={field} id={`${prefix}-date`} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        From
        <input name="start" type="time" className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        To
        <input name="end" type="time" className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        or hours
        <input name="hours" type="number" min={0.25} max={24} step={0.25} inputMode="decimal" className={`${field} w-24`} />
      </label>
    </div>
  );
}

function ContributionLine({ c, anchor, tz }: { c: Contribution; anchor: string; tz: string }) {
  const when = c.started_at ? `${day(c.started_at, tz)}${c.ended_at ? `, ${time(c.started_at, tz)}–${time(c.ended_at, tz)}` : ""}` : null;
  return (
    <li className="list-none rounded-md border border-line bg-surface px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {when ? <span className="font-medium">{when} · </span> : null}
          {c.approved_hours != null ? `${hrs(c.approved_hours)} approved` : `${hrs(c.reported_hours)} reported`}
          {c.approved_hours != null && c.reported_hours != null && c.approved_hours !== c.reported_hours ? ` (you reported ${hrs(c.reported_hours)})` : ""}
          {c.approved_units != null ? ` · ${c.approved_units} ${c.unit}` : c.reported_units != null ? ` · ${c.reported_units} ${c.unit} reported` : ""}
        </span>
        <StatusPill kind="hours" status={c.status} />
      </div>
      <p className="m-0 mt-1 text-xs text-muted">{c.method_label}</p>
      {c.description ? <p className="m-0 mt-1 text-muted">“{c.description}”</p> : null}
      {c.last_reason ? <p className="m-0 mt-1">Reviewer’s note: {c.last_reason}</p> : null}
      {c.status === "revision_requested" ? (
        <form action={resubmitAction.bind(null, c.id, anchor)} className="mt-2 grid gap-2 rounded-md border border-line p-3">
          <p className="m-0 text-sm font-medium">Fix and send it back</p>
          <TimeInputs prefix={`r-${c.id}`} tz={tz} />
          <label className="grid gap-1 text-sm font-medium">
            Note <span className="font-normal text-muted">(optional)</span>
            <input name="description" maxLength={1000} className={field} />
          </label>
          <div>
            <SubmitButton size="sm">Send for approval</SubmitButton>
          </div>
        </form>
      ) : null}
      {c.status === "adjusted" || c.status === "rejected" ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-primary">Disagree with this?</summary>
          <form action={disputeAction.bind(null, c.id, anchor)} className="mt-2 grid gap-2 rounded-md border border-line p-3">
            <label className="grid gap-1 text-sm font-medium">
              What’s wrong?
              <textarea name="reason" required minLength={10} maxLength={1000} rows={2} className="rounded border border-line-strong bg-surface px-3 py-2 font-normal" placeholder="e.g. I stayed until 6 — the front desk saw me leave." />
            </label>
            <div>
              <SubmitButton size="sm" variant="secondary">
                Ask for a second look
              </SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </li>
  );
}

export default async function ImpactPage(props: { searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const [me, res] = await Promise.all([getCurrentUser(), backendFetch("/v1/volunteer/impact")]);
  const tz = zoneOr(me?.timezone);
  const data = res.ok ? ((await res.json()) as Impact) : null;
  const earned = data?.badges.filter((b) => b.earned) ?? [];
  const next = data?.badges.filter((b) => !b.earned).sort((a, b) => b.progress / b.goal - a.progress / a.goal)[0];

  return (
    <>
      <PageHeader
        title="Impact"
        description="Hours count once the organizer approves them. Waiting and self-reported hours are shown separately."
        actions={
          <>
            <ButtonLink href="/volunteer/records" variant="secondary" prefetch={false} icon={<BadgeCheck aria-hidden className="h-4 w-4" />}>
              Share a verified record
            </ButtonLink>
            <ButtonLink href="/api/download?what=impact-csv" variant="secondary" prefetch={false} icon={<Download aria-hidden className="h-4 w-4" />}>
              Export CSV
            </ButtonLink>
            {me ? <ShareButton target={{ type: "volunteer", ref: me.id, title: "My volunteer impact" }} label="Share" /> : null}
          </>
        }
      />
      {sp.flash && FLASH[sp.flash] ? <Toast message={FLASH[sp.flash]} /> : null}
      {sp.error ? (
        <div className="mb-5">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      {!data ? <Notice tone="danger">Your impact couldn’t load. Refresh to try again.</Notice> : null}

      {data ? (
        <>
          <StatStrip
            stats={[
              { label: "Approved hours", value: Math.round(data.totals.hours * 10) / 10 },
              { label: "Waiting for approval", value: `${Math.round(data.totals.pending_hours * 10) / 10} h` },
              { label: "Times you helped", value: data.totals.completed },
              { label: "Badges", value: data.totals.badges }
            ]}
          />
          {data.totals.units.length || data.totals.self_reported_hours ? (
            <p className="m-0 mt-3 text-sm text-muted">
              {data.totals.units.map((u) => `${u.approved} ${u.unit} approved${u.pending ? ` (${u.pending} waiting)` : ""}`).join(" · ")}
              {data.totals.units.length && data.totals.self_reported_hours ? " · " : ""}
              {data.totals.self_reported_hours ? `${Math.round(data.totals.self_reported_hours * 10) / 10} h self-reported (not confirmed by anyone)` : ""}
            </p>
          ) : null}

          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_300px]">
            <section aria-labelledby="timeline-h" id="completed">
              <h2 id="timeline-h" className="m-0 text-lg">
                Your volunteering
              </h2>
              <span id="hours" />
              <span id="tasks" />
              <span id="outcomes" />
              <span id="impact" />
              {!data.timeline.length ? (
                <div className="mt-3">
                  <EmptyState
                    title="Nothing yet"
                    body="When you check out of a shift or an organizer marks your work complete, the hours show up here for approval."
                    action={<ButtonLink href="/volunteer/opportunities/recommended">Find something to do</ButtonLink>}
                  />
                </div>
              ) : (
                <ol className="m-0 mt-3 grid gap-0 border-l-2 border-line p-0 pl-5">
                  {data.timeline.map((w) => (
                    <li key={w.application_id} id={`w-${w.application_id}`} className="relative list-none pb-7 last:pb-0">
                      <span aria-hidden className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" />
                      <p className="m-0 text-xs font-medium text-muted">{day(w.completed_at, tz)}</p>
                      <h3 className="m-0 mt-0.5 text-base font-semibold">
                        <Link prefetch={false} href={`/volunteer/applications/${w.application_id}`} className="text-ink no-underline hover:text-primary hover:underline">
                          {w.title}
                        </Link>
                      </h3>
                      <p className="m-0 mt-0.5 text-sm text-muted">
                        {w.organization_name || (w.requester_name ? `Helped ${w.requester_name}` : "Helped a neighbor")} · {hrs(w.hours)} approved
                        {w.pending_hours ? ` · ${hrs(w.pending_hours)} waiting` : ""}
                      </p>
                      {w.contributions.length ? (
                        <ul className="m-0 mt-2 grid gap-2 p-0">
                          {w.contributions.map((c) => (
                            <ContributionLine key={c.id} c={c} anchor={`#w-${w.application_id}`} tz={tz} />
                          ))}
                        </ul>
                      ) : null}
                      <details className="mt-2">
                        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary">
                          <NotebookPen aria-hidden className="h-4 w-4" /> Report time you gave
                        </summary>
                        <form action={reportAction.bind(null, w.application_id)} className="mt-2 grid max-w-xl gap-2 rounded-md border border-line bg-surface p-3">
                          <TimeInputs prefix={`w-${w.application_id}`} tz={tz} />
                          <label className="grid gap-1 text-sm font-medium">
                            What did you do?
                            <textarea name="description" required rows={2} maxLength={1000} placeholder="e.g. Sorted coats; stayed an extra hour to pack up." className="rounded border border-line-strong bg-surface px-3 py-2 font-normal" />
                          </label>
                          <p className="m-0 text-xs text-muted">The organizer approves it before it counts.</p>
                          <div>
                            <SubmitButton size="sm">Send for approval</SubmitButton>
                          </div>
                        </form>
                      </details>
                    </li>
                  ))}
                </ol>
              )}

              <section id="outside" aria-labelledby="outside-h" className="mt-10">
                <h3 id="outside-h" className="m-0 flex items-center gap-2 text-base">
                  <Clock aria-hidden className="h-4 w-4 text-muted" /> Service outside ThankYou
                </h3>
                <p className="m-0 mt-1 text-sm text-muted">Keep a note of other volunteering here. It stays marked self-reported because nobody on ThankYou can confirm it.</p>
                {data.outside.length ? (
                  <ul className="m-0 mt-3 grid gap-2 p-0">
                    {data.outside.map((o) => (
                      <li key={o.id} className="flex list-none flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-sm">
                        <span>
                          {day(o.started_at || o.created_at, tz)} · {hrs(o.hours)} · {o.text}
                        </span>
                        <StatusPill kind="hours" status={o.status} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary">Add service from elsewhere</summary>
                  <form action={outsideAction} className="mt-2 grid max-w-xl gap-2 rounded-md border border-line bg-surface p-3">
                    <TimeInputs prefix="outside" tz={tz} />
                    <label className="grid gap-1 text-sm font-medium">
                      What and where?
                      <input name="description" required maxLength={1000} className={field} placeholder="e.g. Beach clean-up with my school" />
                    </label>
                    <div>
                      <Button type="submit" size="sm" variant="secondary">
                        Save as self-reported
                      </Button>
                    </div>
                  </form>
                </details>
              </section>
            </section>

            <aside className="grid content-start gap-8">
              <section aria-labelledby="badges-h" id="badges">
                <h2 id="badges-h" className="m-0 flex items-center gap-2 text-lg">
                  <Award aria-hidden className="h-5 w-5 text-sun" /> Badges
                </h2>
                {earned.length ? (
                  <ul className="m-0 mt-3 grid gap-2 p-0">
                    {earned.map((b) => (
                      <li key={b.id} className="list-none rounded-md border border-line bg-surface px-3 py-2.5">
                        <span className="block text-sm font-semibold">{b.title}</span>
                        {b.earned_at ? <span className="block text-xs text-muted">Earned {day(b.earned_at, tz)}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 mt-2 text-sm text-muted">Your first badge comes with your first completed opportunity.</p>
                )}
                {next ? (
                  <div className="mt-3 rounded-md border border-dashed border-line-strong px-3 py-2.5">
                    <span className="block text-sm font-medium">Next: {next.title}</span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-wash" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((next.progress / next.goal) * 100))}%` }} />
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {Math.min(next.progress, next.goal)} of {next.goal}
                    </span>
                  </div>
                ) : null}
              </section>

              <section aria-labelledby="reviews-h" id="reviews">
                <h2 id="reviews-h" className="m-0 flex items-center gap-2 text-lg">
                  <MessageSquareQuote aria-hidden className="h-5 w-5 text-primary" /> What people said
                </h2>
                {data.reviews.count ? (
                  <>
                    <p className="m-0 mt-2 flex items-center gap-1.5 text-sm">
                      <Star aria-hidden className="h-4 w-4 fill-sun text-sun" />
                      <strong>{data.reviews.average}</strong> average from {data.reviews.count} {data.reviews.count === 1 ? "review" : "reviews"}
                    </p>
                    <ul className="m-0 mt-3 grid gap-3 p-0">
                      {data.reviews.latest.map((r, i) => (
                        <li key={i} className="list-none rounded-md border border-line bg-surface px-3 py-2.5 text-sm">
                          {r.comment ? <p className="m-0">“{r.comment}”</p> : <p className="m-0 text-muted">Rated {r.rating}/5</p>}
                          <p className="m-0 mt-1 text-xs text-muted">
                            {r.reviewer_name}
                            {r.request_title ? ` · ${r.request_title}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="m-0 mt-2 text-sm text-muted">Reviews appear here after you and the organizer both leave one.</p>
                )}
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </>
  );
}
