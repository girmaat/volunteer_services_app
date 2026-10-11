import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../org.module.css";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";

export const dynamic = "force-dynamic";

type OrgRequest = { id: string; title: string };

type OrgDocument = {
  id: string;
  doc_type: "waiver" | "training";
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  require_ack: boolean;
  active: boolean;
  created_at: string;
  assignment_count: number;
};

async function loadRequests(): Promise<OrgRequest[]> {
  const res = await backendFetch(`/v1/org/requests`, { method: "GET" });
  if (!res.ok) return [];
  const json = (await res.json()) as { requests?: OrgRequest[] };
  return Array.isArray(json.requests) ? json.requests : [];
}

async function loadDocuments(): Promise<OrgDocument[]> {
  const res = await backendFetch(`/v1/org/documents`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load documents");
  const json = (await res.json()) as { documents?: OrgDocument[] };
  return Array.isArray(json.documents) ? json.documents : [];
}

async function uploadDocument(formData: FormData) {
  "use server";
  const file = formData.get("file");
  const doc_type = String(formData.get("doc_type") || "");
  const title = String(formData.get("title") || "");
  const description = String(formData.get("description") || "");
  const require_ack = formData.get("require_ack") ? "true" : "false";
  const active = formData.get("active") ? "true" : "false";

  if (!file || !(file instanceof File)) redirect("/org/documents?uploaded=0");

  const payload = new FormData();
  payload.set("file", file, file.name);
  payload.set("doc_type", doc_type);
  payload.set("title", title);
  if (description) payload.set("description", description);
  payload.set("require_ack", require_ack);
  payload.set("active", active);

  const res = await backendFetch(`/v1/org/documents`, { method: "POST", body: payload });
  if (!res.ok) redirect("/org/documents?uploaded=0");

  revalidatePath("/org/documents");
  redirect("/org/documents?uploaded=1");
}

async function assignDocument(formData: FormData) {
  "use server";
  const docId = String(formData.get("docId") || "");
  const request_id = String(formData.get("request_id") || "");
  if (!docId) return;

  const payload: any = {};
  if (request_id) payload.request_id = request_id;

  const res = await backendFetch(`/v1/org/documents/${docId}/assign`, { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) redirect("/org/documents?assigned=0");

  revalidatePath("/org/documents");
  if (request_id) revalidatePath(`/org/requests/${request_id}/documents`);
  redirect("/org/documents?assigned=1");
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const [requests, docs] = await Promise.all([loadRequests(), loadDocuments()]);

  return (
    <div className={styles.mainFull}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Docs</h1>
        <span className={styles.meta}>Upload waivers and training docs, then assign them to requests.</span>
      </div>

      <div className={styles.card} style={{ marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Upload document</h2>
        <form action={uploadDocument} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className={styles.label}>Type</label>
            <select className={styles.select} name="doc_type" defaultValue="waiver">
              <option value="waiver">Waiver</option>
              <option value="training">Training</option>
            </select>
          </div>

          <div>
            <label className={styles.label}>File (PDF, JPG, PNG)</label>
            <input className={styles.input} type="file" name="file" accept="application/pdf,image/png,image/jpeg" required />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>Title</label>
            <input className={styles.input} name="title" placeholder="e.g., Volunteer Waiver" required minLength={2} />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.label}>Description (optional)</label>
            <textarea className={styles.textarea} name="description" rows={3} />
          </div>

          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="require_ack" defaultChecked />
              Require acknowledgement
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="active" defaultChecked />
              Active
            </label>
          </div>

          <div>
            <button className={styles.primaryButton} type="submit">
              Upload
            </button>
          </div>
        </form>
      </div>

      <div className={styles.card} style={{ marginTop: 12 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Title</th>
              <th>File</th>
              <th>Ack?</th>
              <th>Active</th>
              <th>Assigned</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.muted}>
                  No documents yet.
                </td>
              </tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className={styles.badge}>{d.doc_type}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <strong>{d.title}</strong>
                      {d.description ? <span className={styles.muted}>{d.description}</span> : null}
                    </div>
                  </td>
                  <td className={styles.muted}>{d.file_name}</td>
                  <td>{d.require_ack ? "Yes" : "No"}</td>
                  <td>{d.active ? "Yes" : "No"}</td>
                  <td>{d.assignment_count ?? 0}</td>
                  <td>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <Link className={styles.smallLink} href={`/org/documents/${d.id}/download`}>
                        Download
                      </Link>
                      <form action={assignDocument} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="hidden" name="docId" value={d.id} />
                        <select className={styles.select} name="request_id" defaultValue="">
                          <option value="">Assign org-wide</option>
                          {requests.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.title}
                            </option>
                          ))}
                        </select>
                        <button className={styles.secondaryButton} type="submit">
                          Assign
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className={styles.muted} style={{ marginTop: 12 }}>
          Tip: to see acknowledgement lists for a specific request, open the request and use the “Documents” tab.
        </p>
      </div>
    </div>
  );
}
