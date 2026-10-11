import { backendFetch, getCurrentUser } from "../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type ReqRow = {
  id: string;
  title: string;
  status: string;
  mode: string | null;
  location_text: string | null;
  needed_by: string | null;
  tags: string[];
  requester_email: string | null;
  requester_org_slug: string | null;
  created_at: string;
};

async function loadRequests(q: string, status: string): Promise<ReqRow[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const url = params.toString() ? `/v1/admin/requests?${params.toString()}` : "/v1/admin/requests";
  const res = await backendFetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load service requests");
  const json = (await res.json()) as { requests: ReqRow[] };
  return json.requests || [];
}

export default async function Page({ searchParams }: { searchParams?: { q?: string; status?: string; error?: string; ok?: string } }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const q = String(searchParams?.q || "").trim();
  const status = String(searchParams?.status || "").trim();
  const rows = await loadRequests(q, status);

  async function updateStatus(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const next = String(formData.get("status") || "open");
    const res = await backendFetch(`/v1/admin/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) redirect(`/admin/opportunities?${q ? `q=${encodeURIComponent(q)}&` : ""}${status ? `status=${encodeURIComponent(status)}&` : ""}error=${encodeURIComponent(String(json?.message || "Failed"))}`);
    revalidatePath("/admin/opportunities");
    redirect(`/admin/opportunities?${q ? `q=${encodeURIComponent(q)}&` : ""}${status ? `status=${encodeURIComponent(status)}&` : ""}ok=1`);
  }

  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";
  const ok = searchParams?.ok === "1";

  return (
    <div className="adminGrid">
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h2 style={{ margin: 0 }}>Opportunity management</h2>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>Moderate service requests (visibility + status).</p>
        </div>

        <form method="get" action="/admin/opportunities" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" name="q" placeholder="Search title / description" defaultValue={q} style={{ width: 240 }} />
          <select className="input" name="status" defaultValue={status || ""}>
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
          <button className="btn" type="submit">Filter</button>
        </form>
      </header>

      {ok ? (
        <div className="adminCard" style={{ borderColor: "rgba(0,120,0,0.25)", background: "rgba(0,120,0,0.05)" }}>
          <strong>Saved.</strong>
        </div>
      ) : null}
      {error ? (
        <div className="adminCard" style={{ borderColor: "rgba(180,0,0,0.25)", background: "rgba(180,0,0,0.05)" }}>
          <strong>Couldn&apos;t complete that action.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div className="adminCard">
        <table className="table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th>Requester</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 900 }}>{r.title}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {r.mode ? `${r.mode}` : ""}{r.location_text ? ` · ${r.location_text}` : ""}{r.needed_by ? ` · Needed by ${new Date(r.needed_by).toLocaleDateString()}` : ""}
                  </div>
                  {r.tags?.length ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Tags: {r.tags.join(", ")}</div> : null}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{r.status}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {r.requester_org_slug ? `Org: ${r.requester_org_slug}` : r.requester_email || "—"}
                  <div style={{ marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
                </td>
                <td>
                  <div className="adminActions">
                    <form action={updateStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <select className="input" name="status" defaultValue={r.status}>
                        <option value="open">Open</option>
                        <option value="paused">Paused</option>
                        <option value="closed">Closed</option>
                      </select>
                      <button className="btn" type="submit">Update</button>
                    </form>
                    <a className="btn" href={`/requests/${encodeURIComponent(r.id)}`}>View</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
