import { backendFetch, getCurrentUser } from "../../../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Doc = { id: string; file_name: string; mime_type: string; uploaded_at: string };
type UserRow = { id: string; email: string; display_name: string | null; verification_status: string; verification_submitted_at: string | null; docs_count: number; last_uploaded_at: string | null; verification_notes: string | null };

async function loadUser(userId: string): Promise<UserRow> {
  const res = await backendFetch("/v1/admin/user-verification/queue", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load queue");
  const json = (await res.json()) as any;
  const found = (Array.isArray(json?.users) ? json.users : []).find((u: any) => u.id === userId);
  if (!found) throw new Error("User not found in queue");
  return found as UserRow;
}

async function loadDocs(userId: string): Promise<Doc[]> {
  const res = await backendFetch(`/v1/admin/user-verification/${encodeURIComponent(userId)}/documents`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load documents");
  const json = (await res.json()) as { documents: Doc[] };
  return json.documents || [];
}

export default async function Page(
  props: { params: Promise<{ userId: string }>; searchParams?: Promise<{ error?: string; ok?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const userId = decodeURIComponent(params.userId);
  const user = await loadUser(userId);
  const docs = await loadDocs(userId);

  async function approve(formData: FormData) {
    "use server";
    const notes = String(formData.get("notes") || "");
    const res = await backendFetch(`/v1/admin/user-verification/${encodeURIComponent(userId)}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined })
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) redirect(`/admin/verification/users/${encodeURIComponent(userId)}?error=${encodeURIComponent(String(json?.message || "Failed"))}`);
    revalidatePath("/admin/verification");
    redirect(`/admin/verification/users/${encodeURIComponent(userId)}?ok=1`);
  }

  async function reject(formData: FormData) {
    "use server";
    const notes = String(formData.get("notes") || "");
    const res = await backendFetch(`/v1/admin/user-verification/${encodeURIComponent(userId)}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined })
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) redirect(`/admin/verification/users/${encodeURIComponent(userId)}?error=${encodeURIComponent(String(json?.message || "Failed"))}`);
    revalidatePath("/admin/verification");
    redirect(`/admin/verification/users/${encodeURIComponent(userId)}?ok=1`);
  }

  const ok = searchParams?.ok === "1";
  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";

  return (
    <div className="adminGrid">
      <header className="flex justify-between gap-3 flex-wrap items-baseline">
        <div>
          <h1 className="m-0">User verification</h1>
          <p className="muted mt-1.5 mb-0">
            Review submitted identity documents.
          </p>
        </div>
        <Link prefetch={false} className="btn" href="/admin/verification?tab=users">Back to queue</Link>
      </header>

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

      <div className="adminCard">
        <div className="font-black">{user.display_name || user.email}</div>
        <div className="muted text-xs mt-1">{user.email}</div>
        <div className="muted text-xs mt-1">Status: {user.verification_status}</div>
        <div className="muted text-xs mt-1">Submitted: {user.verification_submitted_at ? new Date(user.verification_submitted_at).toLocaleString() : "—"}</div>
        {user.verification_notes ? <div className="muted text-xs mt-2">Last notes: {user.verification_notes}</div> : null}
      </div>

      <div className="adminCard">
        <div className="font-black">Documents</div>
        <div className="muted text-xs mt-1">{docs.length} uploaded</div>
        <table className="table mt-2.5">
          <thead>
            <tr>
              <th>File</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="font-extrabold">{d.file_name}</div>
                  <div className="muted text-xs">{d.mime_type}</div>
                </td>
                <td className="muted text-xs">{new Date(d.uploaded_at).toLocaleString()}</td>
                <td>
                  <a className="btn" href={`/admin/verification/documents/${encodeURIComponent(d.id)}/download`}>Download</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adminCard">
        <div className="font-black">Decision</div>
        <div className="muted text-xs mt-1">Your notes are stored on the user record.</div>
        <div className="flex gap-2.5 flex-wrap mt-2.5 items-start">
          <form className="grid gap-2 min-w-[320px]" action={approve}>
            <textarea className="input" name="notes" aria-label="Notes" rows={3} placeholder="Approval notes (optional)" />
            <button className="btn" type="submit">Approve</button>
          </form>
          <form className="grid gap-2 min-w-[320px]" action={reject}>
            <textarea className="input" name="notes" aria-label="Notes" rows={3} placeholder="Rejection reason / next steps" />
            <button className="btn btnDanger" type="submit">Reject</button>
          </form>
        </div>
      </div>
    </div>
  );
}
