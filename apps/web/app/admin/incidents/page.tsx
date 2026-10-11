import { backendFetch, getCurrentUser } from "../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type IncidentRow = {
  id: string;
  org_slug: string;
  org_name: string | null;
  title: string;
  description: string;
  severity: string;
  status: string;
  internal_notes: string | null;
  outcome: string | null;
  request_title: string | null;
  volunteer_email: string | null;
  created_at: string;
};

async function loadIncidents(status: string, severity: string): Promise<IncidentRow[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  const url = params.toString() ? `/v1/admin/incidents?${params.toString()}` : "/v1/admin/incidents";
  const res = await backendFetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load incidents");
  const json = (await res.json()) as { incidents: IncidentRow[] };
  return json.incidents || [];
}

function sevBadge(sev: string) {
  const s = String(sev || "");
  if (s === "critical" || s === "high") return <span className="badge badgeBad">{s}</span>;
  if (s === "medium") return <span className="badge badgeWarn">{s}</span>;
  return <span className="badge">{s || "—"}</span>;
}

export default async function Page(
  props: {
    searchParams?: Promise<{ status?: string; severity?: string; error?: string; ok?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const status = String(searchParams?.status || "").trim();
  const severity = String(searchParams?.severity || "").trim();
  const rows = await loadIncidents(status, severity);

  async function updateIncident(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const nextStatus = String(formData.get("status") || "");
    const internal_notes = String(formData.get("internal_notes") || "");
    const outcome = String(formData.get("outcome") || "");

    const res = await backendFetch(`/v1/admin/incidents/${encodeURIComponent(id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: nextStatus || undefined,
        internal_notes: internal_notes || null,
        outcome: outcome || null
      })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok)
      redirect(
        `/admin/incidents?${status ? `status=${encodeURIComponent(status)}&` : ""}${severity ? `severity=${encodeURIComponent(severity)}&` : ""}error=${encodeURIComponent(
          String(json?.message || "Failed")
        )}`
      );
    revalidatePath("/admin/incidents");
    redirect(`/admin/incidents?${status ? `status=${encodeURIComponent(status)}&` : ""}${severity ? `severity=${encodeURIComponent(severity)}&` : ""}ok=1`);
  }

  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";
  const ok = searchParams?.ok === "1";

  return (
    <div className="adminGrid">
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h1 style={{ margin: 0 }}>Incident review</h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Review organization incident reports and record outcomes.
          </p>
        </div>

        <form method="get" action="/admin/incidents" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="input" name="status" aria-label="Status" defaultValue={status || ""}>
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select className="input" name="severity" aria-label="Severity" defaultValue={severity || ""}>
            <option value="">Any severity</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
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

      {rows.length === 0 ? (
        <div className="adminCard">
          <div style={{ fontWeight: 900 }}>No incident reports found</div>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            There are no incidents matching your current filters.
            {status || severity ? " Try clearing filters to see everything." : ""}
          </p>
        </div>
      ) : null}

      {rows.map((i) => (
        <div key={i.id} className="adminCard">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 360, flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>{i.title}</div>
                {sevBadge(i.severity)}
                <span className="badge">{i.status}</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Org: <strong>{i.org_name || i.org_slug}</strong>
                {i.request_title ? ` · Request: ${i.request_title}` : ""}
                {i.volunteer_email ? ` · Volunteer: ${i.volunteer_email}` : ""}
              </div>
              <div style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{i.description}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{new Date(i.created_at).toLocaleString()}</div>
            </div>

            <div style={{ minWidth: 320 }}>
              <form action={updateIncident} style={{ display: "grid", gap: 8 }}>
                <input type="hidden" name="id" value={i.id} />
                <select className="input" name="status" aria-label="Status" defaultValue={i.status}>
                  <option value="open">Open</option>
                  <option value="in_review">In review</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <textarea className="input" name="internal_notes" aria-label="Internal notes" defaultValue={i.internal_notes || ""} rows={3} placeholder="Internal notes" />
                <textarea className="input" name="outcome" aria-label="Outcome" defaultValue={i.outcome || ""} rows={3} placeholder="Outcome / resolution" />
                <button className="btn" type="submit">Update</button>
              </form>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
