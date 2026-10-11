import Link from "next/link";
import { backendFetch } from "../../lib/backend";
import { Button, EmptyState, Notice, PageHeader } from "../../../components/ui";
import { decideDispute, decideMessage, reviewRequest } from "../_actions";
import { cn } from "../../../lib/cn";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "review", label: "Requests to review" },
  { value: "messages", label: "Held messages" },
  { value: "disputes", label: "Disputes" },
  { value: "reports", label: "Reports" }
];

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Review = { id: string; title: string; description: string; category_label: string; public_area: string | null; requester_name: string; org_name: string | null; verification_status: string; reports_against: number; updated_at: string };
type Held = { id: string; body: string; held_reason: string; created_at: string; request_title: string | null; sender_name: string; sender_rejected_before: number };
type Dispute = { id: string; kind: string; reason: string; created_at: string; request_title: string | null; opened_by_name: string; against_name: string; no_show: boolean | null; late_cancel: boolean | null; review: { rating: number; comment: string | null; strengths: string | null } | null };

export default async function Moderation(props: { searchParams?: Promise<{ tab?: string; category?: string; flash?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const tab = TABS.some((t) => t.value === sp.tab) ? sp.tab! : "review";
  const [metricsRes] = await Promise.all([backendFetch("/v1/admin/metrics")]);
  const metrics = metricsRes.ok ? ((await metricsRes.json()) as { awaiting_review: number; held_messages: number; open_disputes: number }) : null;
  const counts: Record<string, number | undefined> = { review: metrics?.awaiting_review, messages: metrics?.held_messages, disputes: metrics?.open_disputes };

  return (
    <>
      <PageHeader title="Moderation" description="Work the queues oldest first. Every decision is logged." />
      {sp.flash ? (
        <div className="mb-4">
          <Notice tone="success">Done.</Notice>
        </div>
      ) : null}
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      <nav aria-label="Queues" className="mb-6 border-b border-line">
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0">
          {TABS.map((t) => (
            <li key={t.value}>
              <Link
                href={t.value === "reports" ? "/admin/reports" : `/admin/moderation?tab=${t.value}`}
                aria-current={tab === t.value ? "page" : undefined}
                className={cn("-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", tab === t.value ? "border-sun text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {t.label}
                {counts[t.value] ? <span className="text-muted"> ({counts[t.value]})</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "review" ? <ReviewQueue category={sp.category} /> : null}
      {tab === "messages" ? <HeldQueue /> : null}
      {tab === "disputes" ? <DisputeQueue /> : null}
    </>
  );
}

async function ReviewQueue({ category }: { category?: string }) {
  const r = await backendFetch(`/v1/admin/review-queue${category ? `?category=${encodeURIComponent(category)}` : ""}`);
  if (!r.ok) return <Notice tone="danger">Queue unavailable.</Notice>;
  const data = (await r.json()) as { items: Review[]; categories: { category: string; label: string; n: number }[] };
  return (
    <>
      {data.categories.length ? (
        <p className="m-0 mb-4 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/moderation?tab=review" className={cn("rounded-full border px-3 py-1", !category ? "border-primary text-primary" : "border-line text-muted")}>
            All
          </Link>
          {data.categories.map((c) => (
            <Link key={c.category} href={`/admin/moderation?tab=review&category=${c.category}`} className={cn("rounded-full border px-3 py-1", category === c.category ? "border-primary text-primary" : "border-line text-muted")}>
              {c.label} ({c.n})
            </Link>
          ))}
        </p>
      ) : null}
      {!data.items.length ? <EmptyState title="Nothing waiting" body="Sensitive requests appear here before they go live." /> : null}
      <ul className="m-0 grid gap-4 p-0">
        {data.items.map((x) => (
          <li key={x.id} className="list-none rounded-md border border-line bg-surface p-4">
            <p className="m-0 text-sm text-muted">
              {x.category_label} · {x.public_area || "Remote"} · {x.org_name || x.requester_name} ({x.verification_status === "approved" ? "ID verified" : x.verification_status}) · {when(x.updated_at)}
              {x.reports_against ? <span className="font-medium text-danger"> · {x.reports_against} report(s) against poster</span> : null}
            </p>
            <h2 className="m-0 mt-1 text-base">{x.title}</h2>
            <p className="m-0 mt-1 whitespace-pre-line">{x.description}</p>
            <form action={reviewRequest.bind(null, x.id)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <label className="grid gap-1 text-sm">
                Note to the poster <span className="text-muted">(required to send back)</span>
                <input name="notes" maxLength={1000} className="h-10 rounded border border-line-strong bg-surface px-3" />
              </label>
              <Button type="submit" name="decision" value="approve" size="sm">
                Approve
              </Button>
              <Button type="submit" name="decision" value="reject" size="sm" variant="secondary">
                Send back
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}

async function HeldQueue() {
  const r = await backendFetch("/v1/admin/messages/held");
  if (!r.ok) return <Notice tone="danger">Queue unavailable.</Notice>;
  const { items } = (await r.json()) as { items: Held[] };
  if (!items.length) return <EmptyState title="No held messages" body="Messages with payment requests, codes or links from new accounts wait here." />;
  return (
    <ul className="m-0 grid gap-3 p-0">
      {items.map((m) => (
        <li key={m.id} className="list-none rounded-md border border-line bg-surface p-4">
          <p className="m-0 text-sm text-muted">
            {m.sender_name} · {m.request_title || "Direct"} · {when(m.created_at)} · <span className="font-medium text-warning">{m.held_reason}</span>
            {m.sender_rejected_before ? <span className="text-danger"> · {m.sender_rejected_before} rejected before</span> : null}
          </p>
          <p className="m-0 mt-1 whitespace-pre-line">{m.body}</p>
          <form action={decideMessage.bind(null, m.id)} className="mt-3 flex gap-2">
            <Button type="submit" name="decision" value="release" size="sm" variant="secondary">
              Deliver
            </Button>
            <Button type="submit" name="decision" value="reject" size="sm" variant="danger">
              Reject
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}

const KIND: Record<string, string> = { review: "Review", no_show: "No-show", late_cancel: "Late cancellation", other: "Other" };

async function DisputeQueue() {
  const r = await backendFetch("/v1/admin/disputes");
  if (!r.ok) return <Notice tone="danger">Queue unavailable.</Notice>;
  const { items } = (await r.json()) as { items: Dispute[] };
  if (!items.length) return <EmptyState title="No open disputes" />;
  return (
    <ul className="m-0 grid gap-4 p-0">
      {items.map((d) => (
        <li key={d.id} className="list-none rounded-md border border-line bg-surface p-4">
          <p className="m-0 text-sm text-muted">
            {KIND[d.kind]} · {d.request_title || "—"} · opened by {d.opened_by_name} about {d.against_name} · {when(d.created_at)}
          </p>
          <p className="m-0 mt-1 whitespace-pre-line">{d.reason}</p>
          {d.review ? (
            <p className="m-0 mt-2 rounded bg-[var(--muted-bg)] px-3 py-2 text-sm">
              Contested review: {d.review.rating}/5 {d.review.comment || d.review.strengths ? `— “${d.review.comment || d.review.strengths}”` : ""}
            </p>
          ) : null}
          <form action={decideDispute.bind(null, d.id)} className="mt-3 grid gap-2">
            <label className="grid gap-1 text-sm">
              Decision notes <span className="text-muted">(both people see these)</span>
              <textarea name="notes" required minLength={3} maxLength={2000} className="min-h-[70px] rounded border border-line-strong bg-surface px-3 py-2" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="status" value="overturned" size="sm">
                Overturn (remove record)
              </Button>
              <Button type="submit" name="status" value="upheld" size="sm" variant="secondary">
                Uphold
              </Button>
              <Button type="submit" name="status" value="dismissed" size="sm" variant="ghost">
                Dismiss
              </Button>
            </div>
          </form>
        </li>
      ))}
    </ul>
  );
}
