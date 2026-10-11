import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import styles from "../../requester.module.css";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  title: string;
  summary: string;
  status: "open" | "paused" | "closed" | string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string | null;
  needed_by: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

async function loadRequests(): Promise<RequestRow[]> {
  const res = await backendFetch("/v1/requester/requests", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load requests");
  return res.json();
}

function statusLabel(s: string) {
  if (s === "open") return "Open";
  if (s === "paused") return "Paused";
  if (s === "closed") return "Closed";
  return s;
}

function modeLabel(mode: string | null) {
  if (!mode) return "Remote";
  if (mode === "in-person") return "In-person";
  if (mode === "remote") return "Remote";
  if (mode === "hybrid") return "Hybrid";
  return mode;
}

export default async function Page() {
  const user = await getCurrentUser();
  const requests = await loadRequests();

  return (
    <>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>All Requests</h2>
          <p className={styles.meta}>
            Every request you’ve created (including closed).
            {user?.email ? (
              <>
                {" "}Signed in as <strong>{user.email}</strong>.
              </>
            ) : null}
          </p>
        </div>

        <div className={styles.actionsRow} style={{ marginTop: 0 } as any}>
          <Link className={styles.navLink} href="/requester/requests">
            View active
          </Link>
          <Link className={`${styles.button} ${styles.buttonPrimary}`.trim()} href="/requester/requests/new">
            New request
          </Link>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>No requests yet</p>
          <p className={styles.bannerBody}>Create your first request to make it visible to volunteers.</p>
        </div>
      ) : null}

      <div className={styles.grid} aria-label="All requests">
        {requests.map((r) => (
          <Link key={r.id} className={styles.tileLink} href={`/requester/requests/${r.id}`}>
            <div className={styles.tile}>
              <div className={styles.row}>
                <h3 className={styles.tileTitle} style={{ margin: 0 } as any}>
                  {r.title}
                </h3>
                <span className={styles.badge}>{statusLabel(r.status)}</span>
              </div>

              <p className={styles.tileBody}>{r.summary}</p>

              <div className={styles.badges}>
                <span className={styles.badge}>{modeLabel(r.mode)}</span>
                {r.location ? <span className={styles.badge}>{r.location}</span> : null}
                {r.needed_by ? (
                  <span className={styles.badge}>Needed by {new Date(r.needed_by).toLocaleDateString()}</span>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
