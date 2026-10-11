import Link from "next/link";
import { backendFetch } from "../../lib/backend";
import { Button, Notice, PageHeader, StatusPill } from "../../../components/ui";
import { restoreRequest, takeDown } from "../_actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  status: string;
  review_status: string;
  category: string | null;
  is_sensitive: boolean;
  removed_at: string | null;
  removed_reason: string | null;
  mode: string | null;
  location_text: string | null;
  created_at: string;
  requester_email: string | null;
  requester_org_slug: string | null;
};

const STATUSES = [
  ["", "Any status"],
  ["open", "Open"],
  ["pending", "Partly filled"],
  ["filled", "Filled"],
  ["paused", "Paused"],
  ["draft", "Draft"],
  ["in_review", "In review"],
  ["completed", "Completed"],
  ["canceled", "Canceled"],
  ["removed", "Removed by moderators"]
];

export default async function AdminRequests(props: { searchParams?: Promise<{ q?: string; status?: string; error?: string; flash?: string }> }) {
  const sp = (await props.searchParams) || {};
  const q = (sp.q || "").trim();
  const status = (sp.status || "").trim();
  const qs = new URLSearchParams({ limit: "100", ...(q ? { q } : {}), ...(status ? { status } : {}) });
  const r = await backendFetch(`/v1/admin/requests?${qs}`);
  const rows = r.ok ? ((await r.json()) as { requests: Row[] }).requests : null;
  const back = `/admin/opportunities?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`;

  return (
    <>
      <PageHeader title="Requests" description="Search every request. Take down anything that breaks the rules — the poster sees your reason and applicants are told." />
      {sp.flash ? (
        <div className="mb-4">
          <Notice tone="success">{sp.flash === "removed" ? "Request taken down." : sp.flash === "restored" ? "Request restored." : "Saved."}</Notice>
        </div>
      ) : null}
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          Search
          <input name="q" defaultValue={q} className="h-10 w-64 max-w-full rounded border border-line-strong bg-surface px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select name="status" defaultValue={status} className="h-10 rounded border border-line-strong bg-surface px-2">
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" variant="secondary">
          Filter
        </Button>
      </form>
      {!rows ? <Notice tone="danger">Requests unavailable.</Notice> : null}
      <ul className="m-0 border-t border-line p-0">
        {(rows || []).map((x) => (
          <li key={x.id} className="list-none border-b border-line py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 font-semibold">
                  <Link prefetch={false} href={`/opportunities/${x.id}`} className="text-ink">
                    {x.title || "Untitled"}
                  </Link>
                </p>
                <p className="m-0 mt-0.5 text-sm text-muted">
                  {x.category || "—"}
                  {x.is_sensitive ? " (sensitive)" : ""} · {x.mode === "remote" ? "Remote" : x.location_text || "—"} · {x.requester_org_slug || x.requester_email || "—"} ·{" "}
                  {new Date(x.created_at).toLocaleDateString("en-US")}
                </p>
                {x.removed_reason ? <p className="m-0 mt-1 text-sm text-danger">Removed: {x.removed_reason}</p> : null}
              </div>
              <StatusPill kind="request" status={x.review_status === "pending_review" ? "in_review" : x.status} />
            </div>
            <div className="mt-2">
              {x.removed_at ? (
                <form action={restoreRequest.bind(null, x.id, back)}>
                  <Button type="submit" size="sm" variant="secondary">
                    Restore
                  </Button>
                </form>
              ) : ["draft", "open", "pending", "filled", "paused"].includes(x.status) ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-danger">Take down…</summary>
                  <form action={takeDown.bind(null, x.id, back)} className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-sm">
                      Reason (the poster sees this)
                      <input name="reason" required minLength={5} maxLength={500} className="h-10 w-80 max-w-full rounded border border-line-strong bg-surface px-3" />
                    </label>
                    <Button type="submit" size="sm" variant="danger">
                      Take down
                    </Button>
                  </form>
                </details>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
