import Link from "next/link";
import { Plus } from "lucide-react";
import { backendFetch } from "../../lib/backend";
import { Button, ButtonLink, EmptyState, Notice, PageHeader, Toast } from "../../../components/ui";
import CopyLink from "../../../components/records/CopyLink";
import { reissueRecordAction, revokeRecordAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verified records" };

type Rec = {
  id: string;
  url: string;
  state: "valid" | "expired" | "revoked" | "replaced" | "corrected";
  name_mode: string;
  issued_at: string;
  expires_at: string;
  entry_count: number;
  hours: number;
  view_count: number;
  last_viewed_at: string | null;
};

const STATE: Record<Rec["state"], { label: string; cls: string; hint: string }> = {
  valid: { label: "Active", cls: "bg-success-tint text-success", hint: "Anyone with the link can see it." },
  corrected: { label: "Out of date", cls: "bg-warning-tint text-warning", hint: "Hours on it were corrected. The link now says so; make an updated record." },
  replaced: { label: "Replaced", cls: "bg-[var(--muted-bg)] text-ink", hint: "The link points people to the fact it was replaced." },
  revoked: { label: "Turned off", cls: "bg-[var(--muted-bg)] text-ink", hint: "The link shows nothing but that it was turned off." },
  expired: { label: "Expired", cls: "bg-[var(--muted-bg)] text-ink", hint: "The link shows nothing but that it expired." }
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function RecordsPage(props: { searchParams?: Promise<{ created?: string; flash?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const res = await backendFetch("/v1/volunteer/records");
  const records = res.ok ? ((await res.json()) as { records: Rec[] }).records : null;
  return (
    <>
      <PageHeader
        back={<Link prefetch={false} href="/volunteer/history">← Impact</Link>}
        title="Verified records"
        description="Share approved hours with a school, employer or anyone else. They see only what you pick, through a link that expires, and you can turn it off at any time."
        actions={
          <ButtonLink href="/volunteer/records/new" prefetch={false} icon={<Plus aria-hidden className="h-4 w-4" />}>
            New record
          </ButtonLink>
        }
      />
      {sp.created ? <Toast message="Record ready. Copy the link and send it." /> : null}
      {sp.flash === "revoked" ? <Toast message="Turned off. The link no longer shows your hours." /> : null}
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      {!records ? <Notice tone="danger">Your records couldn’t load.</Notice> : null}
      {records && !records.length ? <EmptyState title="No records yet" body="Once an organizer approves your hours you can share them as a record people can check." action={<ButtonLink href="/volunteer/records/new">Make a record</ButtonLink>} /> : null}
      <ul className="m-0 grid gap-3 p-0">
        {records?.map((r) => (
          <li key={r.id} className={`list-none rounded-md border bg-surface p-4 ${sp.created === r.id ? "border-primary" : "border-line"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 font-semibold">
                {r.hours} hours · {r.entry_count} {r.entry_count === 1 ? "entry" : "entries"}
                <span className="font-normal text-muted"> · {r.name_mode === "legal" ? "full name" : "display name"}</span>
              </p>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
            </div>
            <p className="m-0 mt-1 text-sm text-muted">
              Issued {day(r.issued_at)} · {r.state === "expired" ? "expired" : "valid until"} {day(r.expires_at)} · opened {r.view_count} {r.view_count === 1 ? "time" : "times"}. {STATE[r.state].hint}
            </p>
            {r.state === "valid" ? (
              <div className="mt-3">
                <CopyLink url={r.url} label="Record link" />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.state === "valid" || r.state === "corrected" ? (
                <form action={reissueRecordAction.bind(null, r.id)}>
                  <Button type="submit" size="sm" variant={r.state === "corrected" ? "primary" : "secondary"}>
                    {r.state === "corrected" ? "Make an updated record" : "Replace with current hours"}
                  </Button>
                </form>
              ) : null}
              {r.state !== "revoked" && r.state !== "replaced" ? (
                <form action={revokeRecordAction.bind(null, r.id)}>
                  <Button type="submit" size="sm" variant="ghost">
                    Turn off link
                  </Button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
