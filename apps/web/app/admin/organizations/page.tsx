import { backendFetch, getCurrentUser } from "../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type OrgRow = {
  slug: string;
  name: string;
  contact_email: string | null;
  verification_required: boolean;
  verification_status: string;
  verification_submitted_at: string | null;
  verified_at: string | null;
  members_count: number;
  updated_at: string;
};

async function loadOrgs(params: { q: string; status: string; required: string; sort: string; dir: string }): Promise<OrgRow[]> {
  const qp = new URLSearchParams();
  if (params.q) qp.set("q", params.q);
  if (params.status && params.status !== "all") qp.set("status", params.status);
  if (params.required === "0" || params.required === "1") qp.set("required", params.required);
  if (params.sort) qp.set("sort", params.sort);
  if (params.dir) qp.set("dir", params.dir);

  const url = qp.toString() ? `/v1/admin/organizations?${qp.toString()}` : "/v1/admin/organizations";
  const res = await backendFetch(url, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load organizations");
  const json = (await res.json()) as { organizations: OrgRow[] };
  return json.organizations || [];
}

function orgBadge(o: OrgRow) {
  const s = String(o.verification_status || (o.verification_required ? "required" : "not_required"));
  if (s === "approved") return <span className="badge badgeOk">Approved</span>;
  if (s === "submitted" || s === "required") return <span className="badge badgeWarn">Needs review</span>;
  if (s === "rejected") return <span className="badge badgeBad">Rejected</span>;
  return <span className="badge">{s}</span>;
}

export default async function Page(
  props: { searchParams?: Promise<{ q?: string; status?: string; required?: string; sort?: string; dir?: string; error?: string; ok?: string }> }
) {
  const searchParams = await props.searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const q = String(searchParams?.q || "").trim();
  const status = String(searchParams?.status || "all").trim() || "all";
  const required = String(searchParams?.required || "").trim();
  const sort = String(searchParams?.sort || "updated_at").trim() || "updated_at";
  const dir = String(searchParams?.dir || "desc").trim() || "desc";

  const orgs = await loadOrgs({ q, status, required, sort, dir });

  async function toggleVerificationRequired(formData: FormData) {
    "use server";
    const slug = String(formData.get("slug") || "");
    const requiredNext = String(formData.get("required") || "") === "1";

    const res = await backendFetch(`/v1/admin/organizations/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verification_required: requiredNext, verification_status: requiredNext ? "required" : "not_required" })
    });

    const json = (await res.json().catch(() => ({}))) as any;

    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status && status !== "all") qs.set("status", status);
    if (required === "0" || required === "1") qs.set("required", required);
    if (sort) qs.set("sort", sort);
    if (dir) qs.set("dir", dir);

    if (!res.ok) {
      qs.set("error", String(json?.message || "Failed"));
      redirect(`/admin/organizations?${qs.toString()}`);
    }

    revalidatePath("/admin/organizations");
    qs.set("ok", "1");
    redirect(`/admin/organizations?${qs.toString()}`);
  }

  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";
  const ok = searchParams?.ok === "1";

  return (
    <div className="adminGrid">
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h1 style={{ margin: 0 }}>Organization management</h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Review organizations and manage verification requirements.
          </p>
        </div>

        <form method="get" action="/admin/organizations" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" name="q" aria-label="Q" placeholder="Search slug, name, or contact email" defaultValue={q} style={{ width: 260 }} />

          <select className="input" name="status" aria-label="Status" defaultValue={status} style={{ width: 180 }}>
            <option value="all">All statuses</option>
            <option value="needs_review">Needs review</option>
            <option value="approved">Approved</option>
            <option value="submitted">Submitted</option>
            <option value="required">Required</option>
            <option value="rejected">Rejected</option>
            <option value="not_required">Not required</option>
          </select>

          <select className="input" name="required" aria-label="Required" defaultValue={required} style={{ width: 160 }}>
            <option value="">Verification required?</option>
            <option value="1">Required = Yes</option>
            <option value="0">Required = No</option>
          </select>

          <select className="input" name="sort" aria-label="Sort" defaultValue={sort} style={{ width: 200 }}>
            <option value="updated_at">Sort: Last update</option>
            <option value="name">Sort: Name</option>
            <option value="members_count">Sort: Members</option>
            <option value="verification_status">Sort: Verification status</option>
            <option value="verification_submitted_at">Sort: Submitted date</option>
          </select>

          <select className="input" name="dir" aria-label="Dir" defaultValue={dir} style={{ width: 120 }}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>

          <button className="btn" type="submit">Apply</button>
          <a className="btn" href="/admin/verification?tab=organizations">Verification queue</a>
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
              <th>Organization</th>
              <th>Members</th>
              <th>Verification</th>
              <th>Last update</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.slug}>
                <td>
                  <div style={{ fontWeight: 900 }}>{o.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>slug: <code>{o.slug}</code></div>
                  <div className="muted" style={{ fontSize: 12 }}>{o.contact_email || "No contact email"}</div>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{o.members_count}</td>
                <td>
                  {orgBadge(o)}
                  {o.verification_submitted_at ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Submitted {new Date(o.verification_submitted_at).toLocaleDateString()}</div> : null}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{new Date(o.updated_at).toLocaleString()}</td>
                <td>
                  <div className="adminActions">
                    <form action={toggleVerificationRequired}>
                      <input type="hidden" name="slug" value={o.slug} />
                      <input type="hidden" name="required" value={o.verification_required ? "0" : "1"} />
                      <button className="btn" type="submit">{o.verification_required ? "Disable required" : "Require verification"}</button>
                    </form>
                    <a className="btn" href={`/organizations/${encodeURIComponent(o.slug)}`}>View org</a>
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