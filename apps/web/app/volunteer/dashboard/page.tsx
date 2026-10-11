import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../volunteer.module.css";

export const dynamic = "force-dynamic";

type DashboardCounts = {
  recommendedOpportunities: number;
  savedOpportunities: number;
  applicationsNeedingAction: number;
  unreadMessages: number;
  upcomingCommitments: number;
};

async function getCounts(): Promise<DashboardCounts> {
  const res = await backendFetch("/v1/volunteer/dashboard", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load volunteer dashboard counts");
  }
  return (await res.json()) as DashboardCounts;
}

export default async function Page() {
  const user = await getCurrentUser();
  const counts = await getCounts();

  return (
    <>
      <h2 className={styles.sectionTitle}>Overview</h2>
      <p className={styles.meta}>
        Signed in as <strong>{user?.email}</strong>.
      </p>

      <div className={styles.grid}>
        <Link className={styles.tileLink} href="/volunteer/opportunities/recommended">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Recommended opportunities</h3>
            <div className={styles.tileNumber}>{counts.recommendedOpportunities}</div>
            <p className={styles.tileBody}>Browse opportunities that match your availability.</p>
          </div>
        </Link>

        <Link className={styles.tileLink} href="/volunteer/opportunities/saved">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Saved opportunities</h3>
            <div className={styles.tileNumber}>{counts.savedOpportunities}</div>
            <p className={styles.tileBody}>Quickly return to the opportunities you bookmarked.</p>
          </div>
        </Link>

        <Link className={styles.tileLink} href="/volunteer/applications">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Applications</h3>
            <div className={styles.tileNumber}>{counts.applicationsNeedingAction}</div>
            <p className={styles.tileBody}>View all your applications and their statuses.</p>
          </div>
        </Link>

        <Link className={styles.tileLink} href="/volunteer/messages">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Unread messages</h3>
            <div className={styles.tileNumber}>{counts.unreadMessages}</div>
            <p className={styles.tileBody}>Check your inbox for updates and coordination.</p>
          </div>
        </Link>

        <Link className={styles.tileLink} href="/volunteer/calendar">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Upcoming commitments</h3>
            <div className={styles.tileNumber}>{counts.upcomingCommitments}</div>
            <p className={styles.tileBody}>See what’s coming up next on your calendar.</p>
          </div>
        </Link>
      </div>
    </>
  );
}


