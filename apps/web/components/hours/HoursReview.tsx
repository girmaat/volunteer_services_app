import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import { backendFetch } from "../../app/lib/backend";
import { bulkApproveAction, conflictAction, decideAction } from "../../app/_hours/actions";
import { Button, EmptyState, LinkTabs, Notice, PageHeader, StatusPill, Toast } from "../ui";
import { formatInZone, zoneOr } from "../../lib/time";

export type ReviewItem = {
  id: string;
  status: string;
  source: string;
  method_label: string;
  started_at: string | null;
  ended_at: string | null;
  break_minutes: number;
  timezone: string | null;
  reported_hours: number | null;
  reported_units: number | null;
  unit: string | null;
  approved_hours: number | null;
  approved_units: number | null;
  description: string | null;
  last_reason: string | null;
  request_id: string;
  request_title: string;
  target_unit: string | null;
  volunteer_name: string;
  exceptions: string[];
  can_decide: boolean;
  why_not: string | null;
  decided_at: string | null;
};

const FLASH: Record<string, string> = {
  approve: "Approved. It now counts on the volunteer’s record.",
  adjust: "Saved with your change. The volunteer sees your note.",
  reject: "Marked not approved. The volunteer sees your note and can dispute it.",
  request_revision: "Sent back to the volunteer to fix.",
  conflict: "Noted. Another reviewer will decide on this volunteer’s hours.",
  bulk: "Done."
};

const input = "h-10 rounded border border-line-strong bg-surface px-3 text-sm";
const h = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100) / 100} h`);

function When({ c }: { c: ReviewItem }) {
  const tz = zoneOr(c.timezone);
  if (!c.started_at) return <span>No times recorded</span>;
  return (
    <span>
      {formatInZone(c.started_at, tz)}
      {c.ended_at ? ` – ${new Date(c.ended_at).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}` : ""}
      {c.break_minutes ? ` · ${c.break_minutes} min break` : ""}
    </span>
  );
}

/**
 * Hours waiting for a decision, disputed hours, and recent decisions, for organizations
 * (admins and managers) and for individuals who posted a request. Approving is one click; a
 * change, a refusal or sending back needs a note the volunteer sees.
 */
const PAGE = 100;

export default async function HoursReview({ base, status, page, flash, error, approved, skipped }: { base: "/org/hours" | "/requester/hours"; status: string; page?: string; flash?: string; error?: string; approved?: string; skipped?: string }) {
  const as = base === "/org/hours" ? "org" : "requester";
  const tab = ["waiting", "disputed", "decided"].includes(status) ? status : "waiting";
  const pageNo = Math.max(1, Math.min(1000, Number.parseInt(page || "1", 10) || 1));
  const res = await backendFetch(`/v1/contributions/review?as=${as}&status=${tab}&limit=${PAGE}&offset=${(pageNo - 1) * PAGE}`);
  const data = res.ok
    ? ((await res.json()) as { items: ReviewItem[]; page: { total: number; offset: number; next_offset: number | null }; counts: { waiting: number; disputed: number }; org_verified: boolean })
    : null;
  const items = data?.items ?? [];
  const bulkable = items.filter((c) => c.can_decide && c.status === "pending" && !c.exceptions.length);
  const decide = (id: string) => decideAction.bind(null, base, tab, id);

  return (
    <>
      <PageHeader
        title="Volunteer hours"
        description="Approve the time people gave. Only approved hours count on a volunteer’s record; anything you change or turn down needs a short note they’ll see."
      />
      {flash === "bulk" ? <Toast message={`Approved ${approved ?? 0}. ${Number(skipped || 0) ? `${skipped} need a closer look.` : ""}`} /> : flash && FLASH[flash] ? <Toast message={FLASH[flash]} /> : null}
      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {data && !data.org_verified ? (
        <div className="mb-4">
          <Notice tone="warning">
            Only verified organizations can approve hours. <Link href="/org/settings">Finish verification</Link> and these will be waiting for you.
          </Notice>
        </div>
      ) : null}
      <LinkTabs
        label="Hours"
        items={[
          { href: `${base}?status=waiting`, label: `Waiting${data?.counts.waiting ? ` (${data.counts.waiting})` : ""}`, active: tab === "waiting" },
          { href: `${base}?status=disputed`, label: `Disputed${data?.counts.disputed ? ` (${data.counts.disputed})` : ""}`, active: tab === "disputed" },
          { href: `${base}?status=decided`, label: "Decided", active: tab === "decided" }
        ]}
      />
      {!data ? <Notice tone="danger">Hours couldn’t load. Refresh to try again.</Notice> : null}
      {data && !items.length ? (
        <EmptyState
          title={tab === "waiting" ? "Nothing to approve" : tab === "disputed" ? "No disputes" : "No decisions yet"}
          body={tab === "waiting" ? "Hours arrive here when someone checks out, when you mark work complete, or when a volunteer reports time." : undefined}
        />
      ) : null}

      {bulkable.length > 1 ? (
        <form id="bulk" action={bulkApproveAction.bind(null, base, tab)} className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3">
          <span className="text-sm">Tick the entries that look right, then approve them together. Entries with something to check are left out.</span>
          <Button type="submit" size="sm" variant="secondary" icon={<Check aria-hidden className="h-4 w-4" />}>
            Approve ticked
          </Button>
        </form>
      ) : null}

      <ul className="m-0 grid gap-3 p-0">
        {items.map((c) => (
          <li key={c.id} id={`c-${c.id}`} className="list-none rounded-md border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                {bulkable.length > 1 && bulkable.some((b) => b.id === c.id) ? (
                  <input form="bulk" type="checkbox" name="ids" value={c.id} aria-label={`Select ${c.volunteer_name}, ${c.request_title}`} className="mt-1 h-5 w-5 accent-[var(--primary)]" />
                ) : null}
                <div className="min-w-0">
                  <p className="m-0 font-semibold">
                    {c.volunteer_name} ·{" "}
                    <Link prefetch={false} href={`${base === "/org/hours" ? "/org" : "/requester"}/requests/${c.request_id}/applications`}>
                      {c.request_title}
                    </Link>
                  </p>
                  <p className="m-0 mt-0.5 text-sm text-muted">
                    <When c={c} /> · {c.method_label}
                  </p>
                </div>
              </div>
              <StatusPill kind="hours" status={c.status} />
            </div>
            <p className="m-0 mt-2 text-sm">
              <span className="font-medium">Reported:</span> {h(c.reported_hours)}
              {c.reported_units != null ? ` · ${c.reported_units} ${c.unit}` : ""}
              {c.approved_hours != null ? (
                <>
                  {" "}
                  · <span className="font-medium">Approved:</span> {h(c.approved_hours)}
                  {c.approved_units != null ? ` · ${c.approved_units} ${c.unit}` : ""}
                </>
              ) : null}
            </p>
            {c.description ? <p className="m-0 mt-1 text-sm text-muted">“{c.description}”</p> : null}
            {c.last_reason ? <p className="m-0 mt-1 text-sm">Note: {c.last_reason}</p> : null}
            {c.exceptions.length ? (
              <ul className="m-0 mt-2 flex flex-wrap gap-2 p-0">
                {c.exceptions.map((e) => (
                  <li key={e} className="inline-flex list-none items-center gap-1 rounded-full bg-warning-tint px-2.5 py-0.5 text-xs font-medium text-warning">
                    <AlertTriangle aria-hidden className="h-3.5 w-3.5" /> {e}
                  </li>
                ))}
              </ul>
            ) : null}

            {c.why_not ? <p className="m-0 mt-3 text-sm text-muted">{c.why_not}</p> : null}
            {c.can_decide ? (
              <div className="mt-3 flex flex-wrap items-start gap-2">
                {c.status === "pending" || c.status === "disputed" ? (
                  <form action={decide(c.id)}>
                    <input type="hidden" name="action" value="approve" />
                    <Button type="submit" size="sm">
                      Approve {h(c.reported_hours)}
                    </Button>
                  </form>
                ) : null}
                <details className="w-full sm:w-auto">
                  <summary className="cursor-pointer text-sm font-medium text-primary">{c.status === "pending" || c.status === "disputed" ? "Change, send back or decline" : "Correct this decision"}</summary>
                  <form action={decide(c.id)} className="mt-2 grid max-w-xl gap-2 rounded-md border border-line p-3">
                    <div className="flex flex-wrap gap-3">
                      <label className="grid gap-1 text-sm font-medium">
                        Hours to approve
                        <input name="hours" type="number" min={0} max={24} step={0.25} inputMode="decimal" defaultValue={c.approved_hours ?? c.reported_hours ?? ""} className={`${input} w-32`} />
                      </label>
                      {c.target_unit && c.target_unit !== "hours" ? (
                        <label className="grid gap-1 text-sm font-medium">
                          {c.target_unit[0].toUpperCase() + c.target_unit.slice(1)} delivered
                          <input name="units" type="number" min={0} step={1} inputMode="numeric" defaultValue={c.approved_units ?? c.reported_units ?? ""} className={`${input} w-32`} />
                        </label>
                      ) : null}
                    </div>
                    <label className="grid gap-1 text-sm font-medium">
                      Note for the volunteer
                      <textarea name="reason" rows={2} maxLength={1000} required className="rounded border border-line-strong bg-surface px-3 py-2 text-sm font-normal" placeholder="e.g. We closed at 6, so I counted until then." />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" name="action" value="adjust" variant="secondary">
                        Approve with this change
                      </Button>
                      {c.status === "pending" ? (
                        <Button type="submit" size="sm" name="action" value="request_revision" variant="ghost">
                          Send back to fix
                        </Button>
                      ) : null}
                      <Button type="submit" size="sm" name="action" value="reject" variant="ghost">
                        Don’t approve
                      </Button>
                    </div>
                  </form>
                </details>
                {base === "/org/hours" && (c.status === "pending" || c.status === "disputed") ? (
                  <details className="w-full sm:w-auto">
                    <summary className="cursor-pointer text-sm text-muted">I can’t review this person</summary>
                    <form action={conflictAction.bind(null, base, tab, c.id)} className="mt-2 flex max-w-xl flex-wrap items-end gap-2 rounded-md border border-line p-3">
                      <label className="grid flex-1 gap-1 text-sm font-medium">
                        How you know them
                        <input name="relationship" required minLength={2} maxLength={200} className={input} placeholder="e.g. my daughter" />
                      </label>
                      <Button type="submit" size="sm" variant="secondary">
                        Pass to another reviewer
                      </Button>
                    </form>
                  </details>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {data && data.page.total > items.length ? (
        <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted">
            Showing {data.page.offset + 1}–{data.page.offset + items.length} of {data.page.total}
          </span>
          <span className="flex gap-2">
            {pageNo > 1 ? (
              <Link href={`${base}?status=${tab}&page=${pageNo - 1}`} className="rounded-md border border-line px-3 py-1.5 font-semibold">
                Previous
              </Link>
            ) : null}
            {data.page.next_offset != null ? (
              <Link href={`${base}?status=${tab}&page=${pageNo + 1}`} className="rounded-md border border-line px-3 py-1.5 font-semibold">
                Next
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}
