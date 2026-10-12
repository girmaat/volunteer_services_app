import Link from "next/link";
import { backendFetch } from "../../app/lib/backend";
import { ButtonLink, EmptyState, Notice, PageHeader, StatusPill } from "../ui";

type Row = {
  id: string;
  title: string;
  status: string;
  review_status: string;
  owner_approval?: string | null;
  mode: string;
  public_area: string | null;
  starts_at: string | null;
  volunteers_needed: number;
  accepted: number;
  pending: number;
  updated_at: string;
};

const TABS = [
  { value: "active", label: "Active", match: (r: Row) => ["open", "pending", "filled", "paused"].includes(r.status) },
  { value: "draft", label: "Drafts", match: (r: Row) => r.status === "draft" },
  { value: "past", label: "Past", match: (r: Row) => ["completed", "canceled"].includes(r.status) },
  { value: "all", label: "All", match: () => true }
];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function OwnerRequestList({ as, base, tab, title, description, canPost = true }: { as: "requester" | "org"; base: string; tab?: string; title: string; description: string; canPost?: boolean }) {
  const res = await backendFetch(`/v1/requests/mine?as=${as}`);
  const rows = res.ok ? ((await res.json()) as { requests: Row[] }).requests : null;
  const current = TABS.find((t) => t.value === tab) ?? TABS[0];
  const shown = (rows || []).filter(current.match);
  return (
    <>
      <PageHeader title={title} description={description} actions={canPost ? <ButtonLink href={`${base}/new`}>New request</ButtonLink> : null} />
      {rows === null ? <Notice tone="danger">Requests couldn&apos;t load. Refresh to try again.</Notice> : null}
      <nav aria-label="Filter requests" className="mb-6 border-b border-line">
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0">
          {TABS.map((t) => (
            <li key={t.value}>
              <Link prefetch={false}
                href={`${base}?tab=${t.value}`}
                aria-current={t.value === current.value ? "page" : undefined}
                className={`-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${t.value === current.value ? "border-sun text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t.label} <span className="text-muted">({(rows || []).filter(t.match).length})</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows && shown.length === 0 ? (
        <EmptyState
          title={current.value === "draft" ? "No drafts" : current.value === "past" ? "Nothing here yet" : "No active requests"}
          body={current.value === "active" ? "Post what you need and volunteers nearby or online can apply." : undefined}
          action={canPost && current.value === "active" ? <ButtonLink href={`${base}/new`}>New request</ButtonLink> : undefined}
        />
      ) : null}
      {shown.length ? (
        <ul className="m-0 border-t border-line p-0">
          {shown.map((r) => (
            <li key={r.id} className="list-none border-b border-line">
              <Link prefetch={false} href={`${base}/${r.id}`} className="block px-1 py-4 text-ink no-underline hover:text-ink">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{r.title || "Untitled draft"}</span>
                  <StatusPill kind="request" status={r.owner_approval === "pending" ? "awaiting_owner" : r.owner_approval === "rejected" && r.status === "draft" ? "sent_back" : r.review_status === "pending_review" ? "in_review" : r.status} />
                </div>
                <p className="m-0 mt-0.5 text-sm text-muted">
                  {r.mode === "remote" ? "Remote" : r.public_area || "Area not set"} · {r.accepted}/{r.volunteers_needed} volunteers
                  {r.pending ? ` · ${r.pending} to review` : ""} · updated {day(r.updated_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
