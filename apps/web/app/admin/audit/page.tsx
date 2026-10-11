import Link from "next/link";
import { backendFetch } from "../../lib/backend";
import { Notice, PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

type Row = { id: string; action: string; path: string; target_type: string | null; target_id: string | null; details: Record<string, unknown>; created_at: string; actor_email: string | null; actor_role: string | null };

export default async function AuditLog(props: { searchParams?: Promise<{ target?: string; offset?: string }> }) {
  const sp = (await props.searchParams) || {};
  const offset = Math.max(0, Number(sp.offset) || 0);
  const qs = new URLSearchParams({ limit: "50", offset: String(offset), ...(sp.target ? { target: sp.target } : {}) });
  const r = await backendFetch(`/v1/admin/audit-log?${qs}`);
  if (r.status === 403) return <Notice tone="warning">The audit log is for platform admins.</Notice>;
  const data = r.ok ? ((await r.json()) as { items: Row[] }) : null;
  return (
    <>
      <PageHeader title="Audit log" description="Every change made by admins and moderators, newest first." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          Target id
          <input name="target" defaultValue={sp.target || ""} className="h-10 w-80 max-w-full rounded border border-line-strong bg-surface px-3" />
        </label>
        <button type="submit" className="h-10 rounded border border-line-strong bg-surface px-4 text-sm">
          Filter
        </button>
      </form>
      {!data ? <Notice tone="danger">Audit log unavailable.</Notice> : null}
      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-3 font-medium">When</th>
                <th scope="col" className="py-2 pr-3 font-medium">Who</th>
                <th scope="col" className="py-2 pr-3 font-medium">Action</th>
                <th scope="col" className="py-2 pr-3 font-medium">Target</th>
                <th scope="col" className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((x) => (
                <tr key={x.id} className="border-b border-line align-top">
                  <td className="whitespace-nowrap py-2 pr-3">{new Date(x.created_at).toLocaleString("en-US")}</td>
                  <td className="py-2 pr-3">
                    {x.actor_email || "—"}
                    {x.actor_role ? <span className="block text-xs text-muted">{x.actor_role}</span> : null}
                  </td>
                  <td className="py-2 pr-3 font-medium">{x.action}</td>
                  <td className="py-2 pr-3">
                    {x.target_type}
                    {x.target_id ? (
                      <Link href={`/admin/audit?target=${encodeURIComponent(x.target_id)}`} className="block max-w-[14ch] truncate text-xs text-primary">
                        {x.target_id}
                      </Link>
                    ) : null}
                  </td>
                  <td className="max-w-[40ch] py-2">
                    <code className="block whitespace-pre-wrap break-words text-xs">{JSON.stringify(x.details)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-4 flex gap-3 text-sm">
        {offset > 0 ? <Link href={`/admin/audit?${new URLSearchParams({ offset: String(Math.max(0, offset - 50)), ...(sp.target ? { target: sp.target } : {}) })}`}>← Newer</Link> : null}
        {data && data.items.length === 50 ? <Link href={`/admin/audit?${new URLSearchParams({ offset: String(offset + 50), ...(sp.target ? { target: sp.target } : {}) })}`}>Older →</Link> : null}
      </div>
    </>
  );
}
