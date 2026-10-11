import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../volunteer.module.css";

export const dynamic = "force-dynamic";

type Commitment = {
  id: string;
  status: "scheduled" | "confirmed" | "canceled" | "completed";
  start_at: string;
  end_at: string | null;
  opportunity_id: string | null;
  title: string | null;
  location: string | null;
  mode: "in-person" | "remote" | "hybrid" | null;
};

function formatRange(startAt: string, endAt: string | null) {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;
  const startLabel = start.toLocaleString();
  if (end && !Number.isNaN(end.getTime())) {
    return `${startLabel} – ${end.toLocaleString()}`;
  }
  return startLabel;
}

async function getUpcomingCommitments(): Promise<Commitment[]> {
  const res = await backendFetch("/v1/volunteer/calendar/commitments", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load commitments");
  }
  return (await res.json()) as Commitment[];
}

export default async function Page() {
  const user = await getCurrentUser();
  const commitments = await getUpcomingCommitments();

  return (
    <>
      <h1 className={styles.sectionTitle}>Calendar</h1>
      <p className={styles.meta}>
        Signed in as <strong>{user?.email}</strong>.
      </p>

      {commitments.length === 0 ? (
        <div className={styles.tile}>
          <h2 className={styles.tileTitle}>Upcoming</h2>
          <p className={styles.tileBody}>No upcoming commitments yet.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {commitments.map((c) => (
            <div key={c.id} className={styles.tile}>
              <div className={styles.row}>
                <h2 className={styles.tileTitle}>{c.title || "Commitment"}</h2>
                <span className={styles.small}>{new Date(c.start_at).toLocaleString()}</span>
              </div>
              <p className={styles.meta}>
                {c.mode ? `${c.mode} · ` : ""}
                {c.location || ""}
              </p>
              <p className={styles.tileBody}>Status: {c.status}</p>
              {c.opportunity_id ? (
                <p className={styles.meta}>
                  <Link href={`/volunteer/opportunities/${c.opportunity_id}`}>View opportunity</Link>
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}