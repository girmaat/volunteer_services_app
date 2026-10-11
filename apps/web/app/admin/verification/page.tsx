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

export default async function Page(
  props: { searchParams?: Promise<{ tab?: string; error?: string; ok?: string }> }
) {
  const searchParams = await props.searchParams;
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
        <h1 className="m-0">Verification review</h1>
        <p className="muted mt-1.5 mb-0">
          Review identity and legitimacy submissions for users and organizations.
          Approving applies a Verified badge and trust indicators; rejecting keeps verification required and allows resubmission.
        </p>
      </header>

      <div className="adminCard flex gap-2.5 flex-wrap items-center">
        <Link prefetch={false} className="btn" href="/admin/verification?tab=users">Users</Link>
        <Link prefetch={false} className="btn" href="/admin/verification?tab=organizations">Organizations</Link>
        <span className="muted text-xs">
          {tab === "users" ? "User verification queue" : "Organization verification queue"}
        </span>
      </div>

      {ok ? (
        <div className="adminCard border-success bg-success-tint">
          <strong>Saved.</strong>
        </div>
      ) : null}
      {error ? (
        <div className="adminCard border-danger bg-danger-tint">
          <strong>Couldn&apos;t complete that action.</strong>
          <div className="mt-1.5">{error}</div>
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="adminCard">
          {users.length === 0 ? (
            <div className="muted text-xs">
              No user verification submissions are waiting in the queue.
            </div>
          ) : null}
          <table className={`table ${users.length === 0 ? "mt-2.5" : ""}`}>
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
                    <div className="font-black">{u.display_name || u.email}</div>
                    <div className="muted text-xs">{u.email}</div>
                  </td>
                  <td className="muted text-xs">{u.verification_status}</td>
                  <td className="muted text-xs">{u.docs_count}</td>
                  <td className="muted text-xs">{u.verification_submitted_at ? new Date(u.verification_submitted_at).toLocaleString() : "—"}</td>
                  <td>
                    <Link prefetch={false} className="btn" href={`/admin/verification/users/${encodeURIComponent(u.id)}`}>Review</Link>
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
            <div className="muted text-xs">
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
                    <div className="font-black">{o.name}</div>
                    <div className="muted text-xs">slug: <code>{o.slug}</code>{o.location ? ` · ${o.location}` : ""}</div>
                  </td>
                  <td className="muted text-xs">{o.verification_status}</td>
                  <td className="muted text-xs">{o.verification_submitted_at ? new Date(o.verification_submitted_at).toLocaleString() : "—"}</td>
                  <td>
                    <div className="adminActions">
                      <form action={approveOrg}>
                        <input type="hidden" name="slug" value={o.slug} />
                        <input className="input w-[180px]" name="notes" aria-label="Notes" placeholder="Notes" />
                        <button className="btn" type="submit">Approve</button>
                      </form>
                      <form action={rejectOrg}>
                        <input type="hidden" name="slug" value={o.slug} />
                        <input className="input w-[180px]" name="notes" aria-label="Notes" placeholder="Notes" />
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
