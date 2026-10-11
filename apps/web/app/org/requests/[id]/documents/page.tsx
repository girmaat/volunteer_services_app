import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../../../org.module.css";
import { backendFetch, getCurrentUser } from "../../../../lib/backend";
import { getOrgContext } from "../../../../lib/org";

export const dynamic = "force-dynamic";

type RequestDetail = { id: string; title: string };
type AssignedDoc = {
  id: string;
  doc_type: "waiver" | "training";
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  require_ack: boolean;
  active: boolean;
  ack_count: number;
};

async function loadRequest(id: string): Promise<RequestDetail | null> {
  const res = await backendFetch(`/v1/org/requests/${id}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load request");
  const json = (await res.json()) as { request: RequestDetail };
  return json.request;
}

async function loadDocs(id: string): Promise<AssignedDoc[]> {
  const res = await backendFetch(`/v1/org/requests/${id}/documents`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load request docs");
  const json = (await res.json()) as { documents?: AssignedDoc[] };
  return Array.isArray(json.documents) ? json.documents : [];
}

async function unassignDoc(formData: FormData) {
  "use server";
  const requestId = String(formData.get("requestId") || "");
  const docId = String(formData.get("docId") || "");
  if (!requestId || !docId) return;

  const res = await backendFetch(`/v1/org/documents/${docId}/assign?requestId=${encodeURIComponent(requestId)}`, { method: "DELETE" });
  if (!res.ok) redirect(`/org/requests/${requestId}/documents?ok=0`);

  revalidatePath(`/org/requests/${requestId}/documents`);
  redirect(`/org/requests/${requestId}/documents?ok=1`);
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const request = await loadRequest(params.id);
  if (!request) notFound();

  const docs = await loadDocs(params.id);

  return (
    <div className={styles.mainFull}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Documents</h1>
        <Link className={styles.smallLink} href={`/org/requests/${params.id}`}>
          Back to request
        </Link>
      </div>

      <p className={styles.meta} style={{ marginTop: 8 }}>
        Request: <strong>{request.title}</strong>
      </p>

      <div className={styles.card} style={{ marginTop: 12 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Title</th>
              <th>File</th>
              <th>Ack?</th>
              <th>Acknowledged</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  No documents assigned. Assign from Org Docs page.
                </td>
              </tr>
            ) : (
              docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className={styles.badge}>{d.doc_type}</span>
                  </td>
                  <td>
                    <strong>{d.title}</strong>
                    {d.description ? <div className={styles.muted}>{d.description}</div> : null}
                  </td>
                  <td className={styles.muted}>{d.file_name}</td>
                  <td>{d.require_ack ? "Yes" : "No"}</td>
                  <td>{d.ack_count ?? 0}</td>
                  <td>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <Link className={styles.smallLink} href={`/org/documents/${d.id}/download`}>
                        Download
                      </Link>
                      <Link className={styles.smallLink} href={`/org/documents/${d.id}/acks?requestId=${encodeURIComponent(params.id)}`}>
                        View acks
                      </Link>
                      <form action={unassignDoc}>
                        <input type="hidden" name="requestId" value={params.id} />
                        <input type="hidden" name="docId" value={d.id} />
                        <button className={styles.secondaryButton} type="submit">
                          Unassign
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
