import styles from "../../volunteer.module.css";
import HistoryTabs from "../_components/HistoryTabs";
import { backendFetch } from "../../../lib/backend";

export const dynamic = "force-dynamic";

type Badge = {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  earned_at: string | null;
  is_new?: boolean;
  progress: number;
  goal: number;
};

type Milestone = { id: string; label: string; value: number };

type Resp =
  | { enabled: false; badges: Badge[]; milestones: Milestone[]; message?: string }
  | { enabled: true; badges: Badge[]; milestones: Milestone[]; last_seen_at?: string };

async function getBadges(): Promise<{ ok: true; data: Resp } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/badges", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load badges" };
  }
  return { ok: true, data: (await res.json()) as Resp };
}

function formatProgress(b: Badge) {
  if (!Number.isFinite(b.progress) || !Number.isFinite(b.goal)) return "";
  if (b.goal <= 0) return "";
  if (b.id.includes("hours")) return `${b.progress.toFixed(1)} / ${b.goal} hours`;
  return `${Math.floor(b.progress)} / ${b.goal}`;
}

export default async function Page() {
  const resp = await getBadges();

  // Mark badges as seen so newly-earned badges can be highlighted on next visit.
  if (resp.ok && (resp.data as any).enabled === true) {
    await backendFetch("/v1/volunteer/history/badges/seen", { method: "POST" }).catch(() => null);
  }

  return (
    <>
      <h1 className={styles.sectionTitle}>Badges & milestones</h1>
      <HistoryTabs active="badges" />

      {!resp.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>Could not load badges.</strong>
          <div className={styles.meta}>
            Backend responded with {resp.status}. {resp.message}
          </div>
        </div>
      )}

      {resp.ok && resp.data.enabled === false && (
        <div className={`${styles.banner} ${styles.bannerInfo}`}>
          <strong>Badges are disabled.</strong>
          <div className={styles.meta}>{resp.data.message || "Enable badges in backend configuration to view earned badges."}</div>
        </div>
      )}

      {resp.ok && resp.data.enabled === true && (
        <>
          <div className={styles.grid}>
            {resp.data.milestones.map((m) => (
              <div key={m.id} className={styles.tile}>
                <div className={styles.tileTitle}>{m.label}</div>
                <div className={styles.tileNumber}>{m.id === "avg_rating" ? m.value.toFixed(1) : m.value}</div>
              </div>
            ))}
          </div>

          {resp.data.badges.length === 0 && <p className={styles.meta}>No badges yet.</p>}

          {resp.data.badges.length > 0 && (
            <div className={styles.grid}>
              {resp.data.badges.map((b) => (
                <div key={b.id} className={styles.card}>
                  <div className={styles.row}>
                    <div>
                      <div className="font-extrabold">{b.title}</div>
                      <div className={styles.meta}>{b.description}</div>
                    </div>
                    <div className={styles.badges}>
                      <span className={styles.badge}>{b.earned ? "Earned" : "In progress"}</span>
                      {b.earned && b.is_new ? <span className={styles.badge}>New</span> : null}
                    </div>
                  </div>

                  <div className={`${styles.meta} mt-3`}>
                    {b.earned_at ? `Earned on ${new Date(b.earned_at).toLocaleDateString()}` : formatProgress(b)}
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

