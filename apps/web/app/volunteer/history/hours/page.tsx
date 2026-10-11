
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import styles from "../../volunteer.module.css";
import HistoryTabs from "../_components/HistoryTabs";
import ShareButton from "../../../_components/share/ShareButton";

export const dynamic = "force-dynamic";

type BreakdownRow = { request_id: string | null; title: string; organization_name: string | null; hours: number };
type HoursResponse = { total_hours: number; breakdown: BreakdownRow[] };

async function getHours(): Promise<{ ok: true; data: HoursResponse } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/hours", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load hours" };
  }
  return { ok: true, data: (await res.json()) as HoursResponse };
}

export default async function Page() {
  const [me, hours] = await Promise.all([getCurrentUser(), getHours()]);

  return (
    <>
      <h1 className={styles.sectionTitle}>Hours</h1>
      <HistoryTabs active="hours" />

      {me?.id ? (
        <div className={`${styles.actionsRow} mt-2`}>
          <ShareButton target={{ type: "volunteer", ref: me.id, title: "My volunteer profile" }} label="Share impact" className={styles.button} />
        </div>
      ) : null}

      {!hours.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>Could not load hours.</strong>
          <div className={styles.meta}>
            Backend responded with {hours.status}. {hours.message}
          </div>
        </div>
      )}

      {hours.ok && (
        <>
          <div className={styles.card}>
            <div className={styles.row}>
              <div>
                <div className={styles.cardTitle}>Total hours</div>
                <div className={styles.meta}>Based on your impact + task entries.</div>
              </div>
              <div className={styles.badges}>
                <span className={styles.badge}>{Math.round(hours.data.total_hours * 100) / 100}</span>
              </div>
            </div>
          </div>

          {hours.data.breakdown.length === 0 && <p className={styles.meta}>No hours logged yet.</p>}

          {hours.data.breakdown.length > 0 && (
            <div className={styles.list}>
              {hours.data.breakdown.map((r) => (
                <div key={r.request_id ?? "unassigned"} className={styles.card}>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.cardTitle}>{r.title}</div>
                      <div className={styles.meta}>{r.organization_name || "Independent requester"}</div>
                    </div>
                    <div className={styles.badges}>
                      <span className={styles.badge}>{Math.round(Number(r.hours || 0) * 100) / 100}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

