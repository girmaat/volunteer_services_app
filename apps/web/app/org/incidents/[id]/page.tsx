import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../../org.module.css";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import { getOrgContext } from "../../../lib/org";

export const dynamic = "force-dynamic";

type Incident = {
  id: string;
  request_id: string | null;
  request_title: string | null;
  volunteer_user_id: string | null;
  volunteer_email: string | null;
  volunteer_display_name: string | null;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_review" | "resolved" | "closed";
  internal_notes: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
};

async function loadIncident(id: string): Promise<Incident | null> {
  const res = await backendFetch(`/v1/org/incidents/${id}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load incident");
  const json = (await res.json()) as { incident: Incident };
  return json.incident;
}

async function updateIncident(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "");
  const description = String(formData.get("description") || "");
  const severity = String(formData.get("severity") || "");
  const status = String(formData.get("status") || "");
  const internal_notes = String(formData.get("internal_notes") || "");
  const outcome = String(formData.get("outcome") || "");

  const payload: any = {};
  if (title) payload.title = title;
  if (description) payload.description = description;
  if (severity) payload.severity = severity;
  if (status) payload.status = status;
  payload.internal_notes = internal_notes;
  payload.outcome = outcome;

  const res = await backendFetch(`/v1/org/incidents/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  if (!res.ok) redirect(`/org/incidents/${id}?saved=0`);

  revalidatePath(`/org/incidents/${id}`);
  revalidatePath(`/org/incidents`);
  redirect(`/org/incidents/${id}?saved=1`);
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const incident = await loadIncident(params.id);
  if (!incident) notFound();

  return (
    <div className={styles.mainFull}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Incident</h1>
        <Link className={styles.smallLink} href="/org/incidents">
          Back to incidents
        </Link>
      </div>

      <div className={styles.card} style={{ marginTop: 12 }}>
        <div className={styles.meta}>
          <div>Created: {new Date(incident.created_at).toLocaleString()}</div>
          <div>Updated: {new Date(incident.updated_at).toLocaleString()}</div>
          {incident.request_id ? (
            <div>
              Request: <Link href={`/org/requests/${incident.request_id}`}>{incident.request_title || incident.request_id}</Link>
            </div>
          ) : null}
          {incident.volunteer_user_id ? <div>Volunteer: {incident.volunteer_display_name || incident.volunteer_email || incident.volunteer_user_id}</div> : null}
        </div>

        <form action={updateIncident} style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input type="hidden" name="id" value={incident.id} />

          <div>
            <label className={styles.label}>Status</label>
            <select className={styles.select} name="status" defaultValue={incident.status}>
              <option value="open">Open</option>
              <option value="in_review">In review</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className={styles.label}>Severity</label>
            <select className={styles.select} name="severity" defaultValue={incident.severity}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>Title</label>
            <input className={styles.input} name="title" defaultValue={incident.title} required minLength={2} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>Description</label>
            <textarea className={styles.textarea} name="description" defaultValue={incident.description} rows={6} required minLength={5} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>Internal notes (org-only)</label>
            <textarea className={styles.textarea} name="internal_notes" defaultValue={incident.internal_notes || ""} rows={5} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>Outcome</label>
            <textarea className={styles.textarea} name="outcome" defaultValue={incident.outcome || ""} rows={4} />
          </div>

          <div>
            <button className={styles.primaryButton} type="submit">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
