import Link from "next/link";
import { backendFetch } from "../../../lib/backend";
import { ButtonLink, EmptyState, Notice, PageHeader, SubmitButton } from "../../../../components/ui";
import RecordView, { type Snapshot } from "../../../../components/records/RecordView";
import { createRecordAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "New verified record" };

type C = { id: string; status: string; started_at: string | null; created_at: string; approved_hours: number | null; approved_units: number | null; unit: string | null; request_title: string | null; organization_name: string | null };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Step 1 picks entries, the name to show and how long the link lasts; step 2 shows exactly what a
 * recipient will see and asks for confirmation before anything is shared (REC-02).
 */
export default async function NewRecordPage(props: { searchParams?: Promise<{ ids?: string | string[]; name?: string; days?: string; error?: string; edit?: string }> }) {
  const sp = (await props.searchParams) || {};
  const picked = (Array.isArray(sp.ids) ? sp.ids : sp.ids ? [sp.ids] : []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const name = sp.name === "legal" ? "legal" : "display";
  const days = ["7", "30", "90", "365"].includes(String(sp.days)) ? Number(sp.days) : 90;
  const res = await backendFetch("/v1/volunteer/contributions");
  const all = res.ok ? ((await res.json()) as { contributions: C[] }).contributions : [];
  const approved = all.filter((c) => c.status === "approved" || c.status === "adjusted");

  let preview: { snapshot: Snapshot; expires_at: string } | null = null;
  let previewError: string | null = null;
  if (picked.length && !sp.edit) {
    const r = await backendFetch("/v1/volunteer/records/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contributionIds: picked, nameMode: name, expiresInDays: days })
    });
    if (r.ok) preview = await r.json();
    else previewError = ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "The preview couldn’t be made.";
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<Link prefetch={false} href="/volunteer/records">← Verified records</Link>} title={preview ? "Check what they’ll see" : "New verified record"} />
      {sp.error || previewError ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error || previewError}</Notice>
        </div>
      ) : null}

      {preview ? (
        <>
          <RecordView s={preview.snapshot} expiresAt={preview.expires_at} />
          <form action={createRecordAction} className="mt-5 grid gap-3">
            {picked.map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <input type="hidden" name="name" value={name} />
            <input type="hidden" name="days" value={days} />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />
              <span>I want to share this, including my {name === "legal" ? "full name" : "display name"}, with anyone who has the link until {day(preview.expires_at)}.</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>Create link</SubmitButton>
              <Link prefetch={false} href={`/volunteer/records/new?${new URLSearchParams([...picked.map((i) => ["ids", i]), ["name", name], ["days", String(days)], ["edit", "1"]]).toString()}`} className="text-sm font-medium text-muted">
                Change selection
              </Link>
            </div>
          </form>
        </>
      ) : !approved.length ? (
        <EmptyState title="No approved hours yet" body="Records hold only hours an organizer approved. Waiting and self-reported hours can’t go on one." action={<ButtonLink href="/volunteer/history">Back to Impact</ButtonLink>} />
      ) : (
        <form method="get" className="grid gap-6">
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-base font-semibold">Approved hours to include</legend>
            {approved.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-sm has-[:checked]:border-primary">
                <input type="checkbox" name="ids" value={c.id} defaultChecked={!picked.length || picked.includes(c.id)} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />
                <span>
                  <span className="font-medium">{c.request_title}</span> · {c.organization_name || "An individual"}
                  <span className="block text-muted">
                    {day(c.started_at || c.created_at)} · {c.approved_hours ?? 0} h{c.approved_units != null ? ` · ${c.approved_units} ${c.unit}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-base font-semibold">Name to show</legend>
            <label className="flex items-center gap-3 text-sm">
              <input type="radio" name="name" value="display" defaultChecked={name === "display"} className="h-5 w-5 accent-[var(--primary)]" /> My display name
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="radio" name="name" value="legal" defaultChecked={name === "legal"} className="h-5 w-5 accent-[var(--primary)]" /> My full name (schools usually need this)
            </label>
          </fieldset>
          <label className="grid max-w-xs gap-1.5 text-sm font-semibold">
            Link works for
            <select name="days" defaultValue={String(days)} className="h-11 rounded border border-line-strong bg-surface px-3 font-normal">
              <option value="7">1 week</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </label>
          <div>
            <SubmitButton>Preview</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
