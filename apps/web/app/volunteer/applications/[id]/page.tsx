import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, MessageSquare } from "lucide-react";
import { backendFetch } from "../../../lib/backend";
import { Button, ButtonLink, Card, Notice, PageHeader, StatusPill } from "../../../../components/ui";
import ReviewPanel, { type ReviewState } from "../../../../components/reviews/ReviewPanel";
import { confirmAttendanceAction, disputeAction, volunteerCancelAction, volunteerWithdrawAction } from "../../../_requests/applicant-actions";
import { describeRrule, formatInZone } from "../../../../lib/time";

export const dynamic = "force-dynamic";

type Detail = {
  id: string;
  opportunity_id: string;
  status: string;
  message: string | null;
  created_at: string;
  commitment: { id: string; status: string; start_at: string | null; end_at: string | null; volunteer_confirmed_at?: string | null } | null;
  opportunity: {
    id: string;
    title: string;
    location: string;
    exact_address: string | null;
    status: string;
    starts_at: string | null;
    timezone: string | null;
    schedule_type: string | null;
    recurrence_rule: string | null;
    mode: string;
    organization_name: string | null;
  };
};

const FLASH: Record<string, string> = {
  withdrawn: "Application withdrawn.",
  attending: "Thanks for confirming. See you there!",
  canceled: "You've canceled. The organizer was told and the next person on the waitlist moved up.",
  reviewed: "Review saved.",
  disputed: "Dispute sent. Our team will look at it and get back to you."
};

export default async function Page(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const { id } = await props.params;
  const sp = (await props.searchParams) || {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const res = await backendFetch(`/v1/volunteer/applications/${id}`);
  if (!res.ok) notFound();
  const a = (await res.json()) as Detail;
  const o = a.opportunity;
  const tz = o.timezone || "America/New_York";
  const start = a.commitment?.start_at || o.starts_at;
  const within24h = Boolean(start && new Date(start).getTime() - Date.now() < 24 * 3600_000 && new Date(start).getTime() > Date.now());
  const rv = a.status === "completed" ? await backendFetch(`/v1/reviews/applications/${id}`) : null;
  const review = rv && rv.ok ? ((await rv.json()) as ReviewState) : null;
  const back = `/volunteer/applications/${id}`;
  const otherName = o.organization_name || "the organizer";

  return (
    <>
      <PageHeader
        back={<Link prefetch={false} href="/volunteer/applications">← My applications</Link>}
        title={o.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill status={a.status} /> <span>{o.organization_name || "Individual requester"}</span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/inbox/start?requestId=${o.id}`} variant="secondary" icon={<MessageSquare aria-hidden className="h-4 w-4" />}>
              Message
            </ButtonLink>
            <ButtonLink href={`/volunteer/opportunities/${o.id}`} variant="ghost">
              View opportunity
            </ButtonLink>
          </>
        }
      />
      {sp.flash && FLASH[sp.flash] ? (
        <div className="mb-4">
          <Notice tone="success">{FLASH[sp.flash]}</Notice>
        </div>
      ) : null}
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-5">
          <Card className="grid gap-3">
            <p className="m-0">
              <span className="font-medium">When:</span>{" "}
              {start ? `${o.schedule_type === "recurring" ? describeRrule(o.recurrence_rule) + " · from " : ""}${formatInZone(start, tz, { withZone: true })}` : "Flexible"}
            </p>
            <p className="m-0 flex items-start gap-2">
              <span className="font-medium">Where:</span>
              {o.mode === "remote" ? (
                <span>Remote</span>
              ) : o.exact_address ? (
                <span>{o.exact_address}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  {o.location} <Lock aria-hidden className="h-3.5 w-3.5" /> exact address after you&apos;re accepted
                </span>
              )}
            </p>
            {a.message ? (
              <p className="m-0 text-sm text-muted">
                Your message: <span className="text-ink">{a.message}</span>
              </p>
            ) : null}
          </Card>
          {review ? <ReviewPanel applicationId={id} back={back} state={review} otherName={otherName} /> : null}
        </div>

        <aside aria-label="Application actions" className="grid content-start gap-4">
          {a.status === "pending" || a.status === "waitlisted" ? (
            <form action={volunteerWithdrawAction.bind(null, id)}>
              <Button type="submit" variant="secondary" className="w-full">
                Withdraw application
              </Button>
            </form>
          ) : null}
          {(a.status === "accepted" || a.status === "confirmed") && start && new Date(start) > new Date() ? (
            <Card className="grid gap-2">
              {a.commitment?.volunteer_confirmed_at ? (
                <p className="m-0 text-sm font-medium text-success">You confirmed you&apos;re coming. Thank you!</p>
              ) : (
                <form action={confirmAttendanceAction.bind(null, id)}>
                  <Button type="submit" className="w-full">
                    I&apos;m still coming
                  </Button>
                </form>
              )}
              {a.commitment?.id ? (
                <a href={`/api/volunteer/calendar/commitments/${a.commitment.id}/ics`} className="text-sm font-medium text-primary">
                  Add to calendar (.ics)
                </a>
              ) : null}
            </Card>
          ) : null}
          {a.status === "accepted" || a.status === "confirmed" ? (
            <form action={volunteerCancelAction.bind(null, id)} className="grid gap-2 rounded-md border border-line bg-surface p-4">
              <p className="m-0 text-sm font-medium">Can&apos;t make it?</p>
              {within24h ? <p className="m-0 text-sm text-warning">It starts within 24 hours, so this counts as a late cancellation on your reliability.</p> : <p className="m-0 text-sm text-muted">Cancel as early as you can so they can find someone else.</p>}
              <textarea name="reason" maxLength={500} placeholder="A short note for the organizer (optional)" className="min-h-[70px] rounded border border-line-strong bg-surface px-3 py-2 text-sm" />
              <Button type="submit" variant="danger" size="sm">
                Cancel my spot
              </Button>
            </form>
          ) : null}
          {["completed", "canceled"].includes(a.status) ? (
            <details className="rounded-md border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">Something wrong? Open a dispute</summary>
              <form action={disputeAction.bind(null, back, id)} className="mt-3 grid gap-2">
                <label className="grid gap-1 text-sm">
                  About
                  <select name="kind" className="h-10 rounded border border-line-strong bg-surface px-2">
                    <option value="no_show">I was marked as a no-show</option>
                    <option value="late_cancel">A late cancellation</option>
                    <option value="review">A review about me</option>
                    <option value="other">Something else</option>
                  </select>
                </label>
                <textarea name="reason" required minLength={10} maxLength={2000} placeholder="What happened?" className="min-h-[80px] rounded border border-line-strong bg-surface px-3 py-2 text-sm" />
                <Button type="submit" size="sm" variant="secondary">
                  Send to our team
                </Button>
              </form>
            </details>
          ) : null}
        </aside>
      </div>
    </>
  );
}
