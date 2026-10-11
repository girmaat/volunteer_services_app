
import Link from "next/link";
import { backendFetch } from "../../../lib/backend";
import styles from "../../volunteer.module.css";
import HistoryTabs from "../_components/HistoryTabs";

export const dynamic = "force-dynamic";

type Row = {
  application_id: string;
  request_id: string;
  title: string;
  location: string;
  mode: string;
  organization_name: string | null;
  status: string;
  updated_at: string;
  tags: string[];
};

async function getCompleted(): Promise<{ ok: true; rows: Row[] } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/completed", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load completed opportunities" };
  }
  return { ok: true, rows: (await res.json()) as Row[] };
}

export default async function Page() {
  const data = await getCompleted();

  return (
    <>
      <h1 className={styles.sectionTitle}>Completed opportunities</h1>
      <HistoryTabs active="completed" />

      {!data.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>Could not load completed opportunities.</strong>
          <div className={styles.meta}>
            Backend responded with {data.status}. {data.message}
          </div>
        </div>
      )}

      {data.ok && data.rows.length === 0 && <p className={styles.meta}>No completed opportunities yet.</p>}

      {data.ok && data.rows.length > 0 && (
        <div className={styles.list}>
          {data.rows.map((r) => (
            <div key={r.application_id} className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.cardTitle}>{r.title}</div>
                  <div className={styles.meta}>
                    {r.organization_name || "Independent requester"} · {r.mode} · {r.location || "—"}
                  </div>
                  <div className={styles.meta}>Completed: {new Date(r.updated_at).toLocaleString()}</div>
                </div>
                <div className={styles.badges}>
                  <span className={styles.badge}>{r.status}</span>
                </div>
              </div>

              <div className={styles.actions}>
                <Link className={styles.actionLink} href={`/volunteer/applications/${r.application_id}`}>
                  Open application
                </Link>
                <Link className={styles.actionLink} href={`/volunteer/opportunities/${r.request_id}`}>
                  View opportunity
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
