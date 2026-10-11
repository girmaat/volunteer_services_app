import { ButtonLink, PageHeader } from "../../../components/ui";

import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../volunteer.module.css";
import HistoryTabs from "./_components/HistoryTabs";

export const dynamic = "force-dynamic";

type Summary = {
  completed_count: number;
  impact_count: number;
  tasks_count: number;
  outcomes_count: number;
  total_hours: number;
};

async function loadSummary(): Promise<{ ok: true; data: Summary } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/summary", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load summary" };
  }
  return { ok: true, data: (await res.json()) as Summary };
}

export default async function Page() {
  const user = await getCurrentUser();
  const summary = await loadSummary();

  return (
    <>
      <PageHeader
        title="Impact"
        description="Hours, tasks and outcomes from your volunteering."
        actions={
          <ButtonLink href="/api/download?what=impact-csv" variant="secondary" prefetch={false}>
            Export CSV
          </ButtonLink>
        }
      />

      <HistoryTabs active="summary" />

      {!summary.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>History is temporarily unavailable.</strong>
          <div className={styles.meta}>
            Backend responded with {summary.status}. {summary.message}
          </div>
        </div>
      )}

      <div className={styles.grid}>
        <Link href="/volunteer/history/completed" className={styles.tile}>
          <h2 className={styles.tileTitle}>Completed opportunities</h2>
          <div className={styles.tileNumber}>{summary.ok ? summary.data.completed_count : "—"}</div>
          <p className={styles.tileBody}>See everything you’ve completed.</p>
        </Link>

        <Link href="/volunteer/history/impact" className={styles.tile}>
          <h2 className={styles.tileTitle}>Impact log</h2>
          <div className={styles.tileNumber}>{summary.ok ? summary.data.impact_count : "—"}</div>
          <p className={styles.tileBody}>Notes and hours you’ve logged.</p>
        </Link>

        <Link href="/volunteer/history/hours" className={styles.tile}>
          <h2 className={styles.tileTitle}>Hours</h2>
          <div className={styles.tileNumber}>{summary.ok ? Math.round(summary.data.total_hours * 100) / 100 : "—"}</div>
          <p className={styles.tileBody}>Totals and per-opportunity breakdown.</p>
        </Link>

        <Link href="/volunteer/history/tasks" className={styles.tile}>
          <h2 className={styles.tileTitle}>Tasks</h2>
          <div className={styles.tileNumber}>{summary.ok ? summary.data.tasks_count : "—"}</div>
          <p className={styles.tileBody}>Task entries you’ve recorded.</p>
        </Link>

        <Link href="/volunteer/history/outcomes" className={styles.tile}>
          <h2 className={styles.tileTitle}>Outcomes</h2>
          <div className={styles.tileNumber}>{summary.ok ? summary.data.outcomes_count : "—"}</div>
          <p className={styles.tileBody}>Outcome statements and metrics.</p>
        </Link>
      </div>
    </>
  );
}
