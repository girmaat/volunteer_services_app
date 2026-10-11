import Link from "next/link";
import styles from "../org.module.css";
import { backendFetch } from "../../lib/backend";

export const dynamic = "force-dynamic";

type OrgDashboard = {
  openRequests: number;
  pendingApplications: number;
  unreadMessages: number;
  activeMembers: number;
};

async function getData(): Promise<{ data: OrgDashboard | null; error: string | null }> {
  try {
    const res = await backendFetch("/v1/org/dashboard", { method: "GET" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: null, error: `Dashboard API returned ${res.status}${body ? `: ${body}` : ""}` };
    }
    return { data: (await res.json()) as OrgDashboard, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message ?? "Failed to reach backend" };
  }
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.card} style={{ display: "grid", gap: 6 }}>
      <div className={styles.muted} style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

export default async function OrgDashboardPage() {
  const { data, error } = await getData();

  return (
    <div className={styles.contentNarrow}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Org dashboard</h2>
          <p className={styles.muted} style={{ margin: "6px 0 0 0" }}>
            Quick snapshot of requests, applicants, and messages.
          </p>
        </div>

        <Link href="/org/requests/new" className={styles.smallLink}>
          Create request
        </Link>
      </header>

      {error ? (
        <div className={styles.bannerError} role="alert" aria-live="polite">
          <p className={styles.bannerTitle}>Couldn&apos;t load dashboard</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 14 }}>
        <StatCard label="Open requests" value={data?.openRequests ?? 0} />
        <StatCard label="Pending applications" value={data?.pendingApplications ?? 0} />
        <StatCard label="Unread messages" value={data?.unreadMessages ?? 0} />
        <StatCard label="Active team members" value={data?.activeMembers ?? 0} />
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <Link href="/org/requests" className={styles.primaryButton} style={{ textDecoration: "none" }}>
          View requests
        </Link>
        <Link href="/org/applications" className={styles.smallLink} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}>
          Review applications
        </Link>
      </div>
    </div>
  );
}
