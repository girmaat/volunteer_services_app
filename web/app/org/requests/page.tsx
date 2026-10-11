import Link from "next/link";
import styles from "../org.module.css";
import { backendFetch } from "../../lib/backend";

export const dynamic = "force-dynamic";

type OrgRequestRow = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
};

async function loadRequests(): Promise<{ rows: OrgRequestRow[]; total: number; error: string | null }> {
  try {
    const res = await backendFetch("/v1/org/requests", { method: "GET" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { rows: [], total: 0, error: `Requests API returned ${res.status}${body ? `: ${body}` : ""}` };
    }
    const data = (await res.json().catch(() => ({}))) as any;
    return { rows: (data?.requests || []) as OrgRequestRow[], total: Number(data?.total ?? (data?.requests?.length ?? 0)), error: null };
  } catch (e: any) {
    return { rows: [], total: 0, error: e?.message ?? "Failed to reach backend" };
  }
}

function statusLabel(s: string) {
  const v = (s || "").toLowerCase();
  if (v === "open") return "Open";
  if (v === "closed") return "Closed";
  if (v === "draft") return "Draft";
  return s || "Unknown";
}

export default async function OrgRequestsPage() {
  const { rows, total, error } = await loadRequests();

  return (
    <div className={styles.contentNarrow}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Org requests</h2>
          <p className={styles.muted} style={{ margin: "6px 0 0 0" }}>
            Create and manage requests posted on behalf of your organization.
            <span style={{ marginLeft: 8, fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
              ({error ? "—" : total} total)
            </span>
          </p>
        </div>
        <Link href="/org/requests/new" className={styles.primaryButton} style={{ textDecoration: "none" }}>
          Create request
        </Link>
      </div>
      <div
        className={styles.card}
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>Want to help someone too?</p>
          <p className={styles.muted} style={{ margin: "6px 0 0 0" }}>
            If you have a moment, browse volunteer opportunities and support someone nearby.
          </p>
        </div>
        <Link href="/opportunities" className={styles.smallLink} style={{ whiteSpace: "nowrap" }}>
          Browse opportunities →
        </Link>
      </div>


      {error ? (
        <div className={styles.bannerError} role="alert" aria-live="polite">
          <p className={styles.bannerTitle}>Couldn&apos;t load requests</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className={styles.card} style={{ marginTop: 14 }}>
          <p style={{ margin: 0 }}>No requests yet.</p>
          <p className={styles.muted} style={{ margin: "6px 0 0 0" }}>
            Create your first request to start receiving volunteer applications.
          </p>
        </div>
      ) : (
        <div className={styles.card} style={{ marginTop: 14 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/org/requests/${r.id}`} className={styles.smallLink}>
                      {r.title}
                    </Link>
                  </td>
                  <td>{statusLabel(r.status)}</td>
                  <td>{new Date(r.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.help}>
        Need to update org info?{" "}
        <Link href="/org/settings" className={styles.smallLink}>
          Org settings
        </Link>
      </div>
    </div>
  );
}

