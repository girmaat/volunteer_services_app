import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../../../lib/backend";
import { getOrgContext } from "../../../../lib/org";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const res = await backendFetch(`/v1/org/requests/${id}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load request");
  return (await res.json()) as any;
}

async function saveAction(id: string, formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const payload = {
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    status: String(formData.get("status") || ""),
    location_text: String(formData.get("location_text") || "") || null,
    mode: String(formData.get("mode") || "") || null,
    needed_by: String(formData.get("needed_by") || "") || null
  };

  const res = await backendFetch(`/v1/org/requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) redirect(`/org/requests/${id}/edit?error=${encodeURIComponent("Save failed")}`);
  redirect(`/org/requests/${id}`);
}

async function cancelAction(id: string) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");

  const res = await backendFetch(`/v1/org/requests/${id}/cancel`, { method: "POST" });
  if (!res.ok) redirect(`/org/requests/${id}/edit?error=${encodeURIComponent("Cancel failed")}`);
  redirect(`/org/requests/${id}`);
}

export default async function Page({ params, searchParams }: { params: { id: string }; searchParams?: { error?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const r = await load(params.id);

  return (
    <div>
      <h2>Edit request</h2>
      {searchParams?.error ? <p style={{ color: "crimson" }}>{searchParams.error}</p> : null}

      <form action={saveAction.bind(null, params.id)} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label>
          Title
          <input name="title" required minLength={2} defaultValue={r.title} />
        </label>

        <label>
          Description
          <textarea name="description" required minLength={10} rows={6} defaultValue={r.description} />
        </label>

        <label>
          Status
          <select name="status" defaultValue={r.status}>
            <option value="open">Open</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <label>
          Location (optional)
          <input name="location_text" defaultValue={r.location_text || ""} />
        </label>

        <label>
          Mode (optional)
          <select name="mode" defaultValue={r.mode || ""}>
            <option value="">Select…</option>
            <option value="in-person">In-person</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>

        <label>
          Needed by (optional)
          <input name="needed_by" defaultValue={r.needed_by ? String(r.needed_by).slice(0, 16) : ""} />
        </label>

        <button type="submit">Save</button>
      </form>

      <form action={cancelAction.bind(null, params.id)} style={{ marginTop: 16 }}>
        <button type="submit">Cancel request</button>
      </form>
    </div>
  );
}
