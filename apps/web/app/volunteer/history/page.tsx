import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, Download, MessageSquareQuote, NotebookPen, Star } from "lucide-react";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import ShareButton from "../../_components/share/ShareButton";
import { ButtonLink, EmptyState, Notice, PageHeader, StatStrip, SubmitButton, Toast } from "../../../components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impact" };

type Note = { id: string; kind: "note" | "task" | "outcome"; date: string | null; hours: number | null; text: string | null; quantity: string | null };
type Work = {
  application_id: string;
  request_id: string;
  title: string;
  organization_name: string | null;
  requester_name: string | null;
  completed_at: string;
  hours: number;
  auto_hours: boolean;
  notes: Note[];
};
type Badge = { id: string; title: string; description: string; earned: boolean; earned_at: string | null; progress: number; goal: number };
type Impact = {
  totals: { hours: number; completed: number; organizations: number; people: number; badges: number };
  timeline: Work[];
  other_notes: Note[];
  badges: Badge[];
  reviews: { count: number; average: number | null; latest: { rating: number; comment: string | null; created_at: string; request_title: string | null; reviewer_name: string }[] };
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const hrs = (n: number) => `${Math.round(n * 10) / 10} h`;

/** Optional note (and corrected hours) on one completed engagement. */
async function addNote(fd: FormData) {
  "use server";
  const requestId = String(fd.get("requestId") || "");
  const applicationId = String(fd.get("applicationId") || "");
  const text = String(fd.get("notes") || "").trim();
  const hoursRaw = String(fd.get("hours") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) redirect("/volunteer/history");
  if (!text && !hoursRaw) redirect(`/volunteer/history?error=${encodeURIComponent("Write a note or enter the hours.")}#w-${applicationId}`);
  const r = await backendFetch("/v1/volunteer/history/impact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      request_application_id: /^[0-9a-f-]{36}$/i.test(applicationId) ? applicationId : undefined,
      impact_date: new Date().toISOString().slice(0, 10),
      hours: hoursRaw ? Math.max(0, Math.min(1000, Number(hoursRaw) || 0)) : 0,
      notes: text || undefined
    })
  });
  redirect(r.ok ? `/volunteer/history?flash=noted#w-${applicationId}` : `/volunteer/history?error=${encodeURIComponent("That note didn’t save. Try again.")}#w-${applicationId}`);
}

function NoteLine({ n }: { n: Note }) {
  const label = n.kind === "outcome" ? "Outcome" : n.kind === "task" ? "Task" : "Note";
  return (
    <li className="list-none text-sm">
      <span className="font-medium text-ink">{label}:</span> {n.text || (n.hours ? `${hrs(n.hours)} logged` : "")}
      {n.quantity ? <span className="text-muted"> · {n.quantity}</span> : null}
      {n.kind !== "outcome" && n.hours ? <span className="text-muted"> · {hrs(n.hours)}</span> : null}
      {n.date ? <span className="text-muted"> · {day(n.date)}</span> : null}
    </li>
  );
}

export default async function ImpactPage(props: { searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const [me, res] = await Promise.all([getCurrentUser(), backendFetch("/v1/volunteer/impact")]);
  const data = res.ok ? ((await res.json()) as Impact) : null;
  const earned = data?.badges.filter((b) => b.earned) ?? [];
  const next = data?.badges.filter((b) => !b.earned).sort((a, b) => b.progress / b.goal - a.progress / a.goal)[0];

  return (
    <>
      <PageHeader
        title="Impact"
        description="What you’ve done, the time you’ve given and what people said."
        actions={
          <>
            <ButtonLink href="/api/download?what=impact-csv" variant="secondary" prefetch={false} icon={<Download aria-hidden className="h-4 w-4" />}>
              Export CSV
            </ButtonLink>
            {me ? <ShareButton target={{ type: "volunteer", ref: me.id, title: "My volunteer impact" }} label="Share" /> : null}
          </>
        }
      />
      {sp.flash === "noted" ? <Toast message="Saved to your impact." /> : null}
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
              { label: "Hours given", value: Math.round(data.totals.hours * 10) / 10 },
              { label: "Times you helped", value: data.totals.completed },
              { label: "People and organizations", value: data.totals.people + data.totals.organizations },
              { label: "Badges", value: data.totals.badges }
            ]}
          />

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
                    title="Nothing completed yet"
                    body="When an organizer marks something you helped with as done, it shows up here with its hours."
                    action={<ButtonLink href="/volunteer/opportunities/recommended">Find something to do</ButtonLink>}
                  />
                </div>
              ) : (
                <ol className="m-0 mt-3 grid gap-0 border-l-2 border-line p-0 pl-5">
                  {data.timeline.map((w) => (
                    <li key={w.application_id} id={`w-${w.application_id}`} className="relative list-none pb-7 last:pb-0">
                      <span aria-hidden className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" />
                      <p className="m-0 text-xs font-medium text-muted">{day(w.completed_at)}</p>
                      <h3 className="m-0 mt-0.5 text-base font-semibold">
                        <Link prefetch={false} href={`/volunteer/applications/${w.application_id}`} className="text-ink no-underline hover:text-primary hover:underline">
                          {w.title}
                        </Link>
                      </h3>
                      <p className="m-0 mt-0.5 text-sm text-muted">
                        {w.organization_name || (w.requester_name ? `Helped ${w.requester_name}` : "Helped a neighbor")} · {hrs(w.hours)}
                        {w.auto_hours ? " (from the schedule)" : ""}
                      </p>
                      {w.notes.length ? <ul className="m-0 mt-2 grid gap-1 p-0">{w.notes.map((n) => <NoteLine key={n.id} n={n} />)}</ul> : null}
                      <details className="mt-2">
                        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary">
                          <NotebookPen aria-hidden className="h-4 w-4" /> {w.notes.length ? "Add another note" : "Add a note or correct the hours"}
                        </summary>
                        <form action={addNote} className="mt-2 grid max-w-lg gap-2 rounded-md border border-line bg-surface p-3">
                          <input type="hidden" name="requestId" value={w.request_id} />
                          <input type="hidden" name="applicationId" value={w.application_id} />
                          <label className="grid gap-1 text-sm font-medium">
                            What happened? <span className="font-normal text-muted">(optional)</span>
                            <textarea name="notes" rows={2} maxLength={1000} placeholder="e.g. Delivered 12 meals; Mr. Lee asked for me again." className="rounded border border-line-strong bg-surface px-3 py-2 font-normal" />
                          </label>
                          <label className="grid w-40 gap-1 text-sm font-medium">
                            Hours <span className="font-normal text-muted">(if different)</span>
                            <input name="hours" type="number" min={0} max={1000} step={0.25} inputMode="decimal" className="h-10 rounded border border-line-strong bg-surface px-3 font-normal" />
                          </label>
                          <div>
                            <SubmitButton size="sm">Save</SubmitButton>
                          </div>
                        </form>
                      </details>
                    </li>
                  ))}
                </ol>
              )}
              {data.other_notes.length ? (
                <div className="mt-8">
                  <h3 className="m-0 text-base">Other notes you logged</h3>
                  <ul className="m-0 mt-2 grid gap-1 p-0">{data.other_notes.map((n) => <NoteLine key={n.id} n={n} />)}</ul>
                </div>
              ) : null}
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
                        {b.earned_at ? <span className="block text-xs text-muted">Earned {day(b.earned_at)}</span> : null}
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
