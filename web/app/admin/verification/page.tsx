import { backendFetch, getCurrentUser } from "../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export const dynamic = "force-dynamic";

type OrgQueueRow = {
  slug: string;
  name: string;
  verification_required: boolean;
  verification_status: string;
  verification_submitted_at: string | null;
  verification_notes: string | null;
  location: string | null;
};

type UserQueueRow = {
  id: string;
  email: string;
  display_name: string | null;
  verification_required: boolean;
  verification_status: string;
  verification_submitted_at: string | null;
  docs_count: number;
  last_uploaded_at: string | null;
};

async function loadOrgQueue(): Promise<OrgQueueRow[]> {
  const res = await backendFetch("/v1/admin/org-verification/queue", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load org queue");
  const json = (await res.json()) as { orgs: OrgQueueRow[] };
  return json.orgs || [];
}

async function loadUserQueue(): Promise<UserQueueRow[]> {
  const res = await backendFetch("/v1/admin/user-verification/queue", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load user queue");
  const json = (await res.json()) as { users: UserQueueRow[] };
  return json.users || [];
}

export default async function Page({ searchParams }: { searchParams?: { tab?: string; error?: string; ok?: string } }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const tab = String(searchParams?.tab || "users");
  const ok = searchParams?.ok === "1";
  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";

  async function approveOrg(formData: FormData) {
    "use server";
    const slug = String(formData.get("slug") || "");
    const notes = String(formData.get("notes") || "");
    const res = await backendFetch(`/v1/admin/org-verification/${encodeURIComponent(slug)}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) redirect(`/admin/verification?tab=organizations&error=${encodeURIComponent(String(json?.message || "Failed"))}`);
    revalidatePath("/admin/verification");
    redirect("/admin/verification?tab=organizations&ok=1");
  }

  async function rejectOrg(formData: FormData) {
    "use server";
    const slug = String(formData.get("slug") || "");
    const notes = String(formData.get("notes") || "");
    const res = await backendFetch(`/v1/admin/org-verification/${encodeURIComponent(slug)}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) redirect(`/admin/verification?tab=organizations&error=${encodeURIComponent(String(json?.message || "Failed"))}`);
    revalidatePath("/admin/verification");
    redirect("/admin/verification?tab=organizations&ok=1");
  }

  const orgs = tab === "organizations" ? await loadOrgQueue() : [];
  const users = tab === "users" ? await loadUserQueue() : [];

  return (
    <div className="adminGrid">
      <header>
        <h2 style={{ margin: 0 }}>Verification review</h2>
        <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
          Review identity and legitimacy submissions for users and organizations.
          Approving applies a Verified badge and trust indicators; rejecting keeps verification required and allows resubmission.
        </p>
      </header>

      <div className="adminCard" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Link className="btn" href="/admin/verification?tab=users">Users</Link>
        <Link className="btn" href="/admin/verification?tab=organizations">Organizations</Link>
        <span className="muted" style={{ fontSize: 12 }}>
          {tab === "users" ? "User verification queue" : "Organization verification queue"}
        </span>
      </div>

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

      {tab === "users" ? (
        <div className="adminCard">
          {users.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No user verification submissions are waiting in the queue.
            </div>
          ) : null}
          <table className="table" style={{ marginTop: users.length === 0 ? 10 : undefined }}>
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Docs</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 900 }}>{u.display_name || u.email}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{u.verification_status}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{u.docs_count}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{u.verification_submitted_at ? new Date(u.verification_submitted_at).toLocaleString() : "—"}</td>
                  <td>
                    <Link className="btn" href={`/admin/verification/users/${encodeURIComponent(u.id)}`}>Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "organizations" ? (
        <div className="adminCard">
          {orgs.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              No organization verification submissions are waiting in the queue.
            </div>
          ) : null}
          <table className="table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.slug}>
                  <td>
                    <div style={{ fontWeight: 900 }}>{o.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>slug: <code>{o.slug}</code>{o.location ? ` · ${o.location}` : ""}</div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{o.verification_status}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{o.verification_submitted_at ? new Date(o.verification_submitted_at).toLocaleString() : "—"}</td>
                  <td>
                    <div className="adminActions">
                      <form action={approveOrg}>
                        <input type="hidden" name="slug" value={o.slug} />
                        <input className="input" name="notes" placeholder="Notes" style={{ width: 180 }} />
                        <button className="btn" type="submit">Approve</button>
                      </form>
                      <form action={rejectOrg}>
                        <input type="hidden" name="slug" value={o.slug} />
                        <input className="input" name="notes" placeholder="Notes" style={{ width: 180 }} />
                        <button className="btn btnDanger" type="submit">Reject</button>
                      </form>
                      <a className="btn" href={`/organizations/${encodeURIComponent(o.slug)}`}>View</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
