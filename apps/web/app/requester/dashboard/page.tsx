import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../requester.module.css";

export const dynamic = "force-dynamic";

type RequesterDashboardCounts = {
  activeRequests: number;
  pendingApplications: number;
  upcoming: number;
  unreadThreads: number;
};

type RecentApplication = {
  application_id: string;
  request_id: string;
  request_title: string;
  status: string;
  message: string | null;
  created_at: string;
  volunteer_user_id: string;
  volunteer_email: string;
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
};

type RecentThread = {
  peer_id: string;
  request_id: string | null;
  application_id: string | null;
  request_title: string | null;
  peer_email: string;
  peer_display_name: string | null;
  peer_avatar_url: string | null;
  peer_public_location: string | null;
  last_body: string;
  last_at: string;
  unread_count: number;
};

type RequesterActivity = {
  recentApplications: RecentApplication[];
  recentThreads: RecentThread[];
};

type ReputationSummary = {
  received: { average_rating: number; count: number };
  given: { count: number };
};

async function getActivity(): Promise<RequesterActivity> {
  const res = await backendFetch("/v1/requester/activity", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load requester activity");
  }
  return (await res.json()) as RequesterActivity;
}

async function getCounts(): Promise<RequesterDashboardCounts> {
  const res = await backendFetch("/v1/requester/dashboard", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load requester dashboard counts");
  }
  return (await res.json()) as RequesterDashboardCounts;
}

async function getReputationSummary(): Promise<ReputationSummary | null> {
  const res = await backendFetch("/v1/requester/reputation/summary", { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as ReputationSummary;
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span aria-label={`Rating: ${r} out of 5`}>
      {"★".repeat(r)}
      {"☆".repeat(5 - r)}
    </span>
  );
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

function threadHref(t: RecentThread) {
  const qs = new URLSearchParams();
  if (t.request_id) qs.set("requestId", t.request_id);
  if (t.application_id) qs.set("applicationId", t.application_id);
  const q = qs.toString();
  return `/requester/messages/${t.peer_id}` + (q ? `?${q}` : "");
}

function formatStatus(s: string) {
  const v = String(s || "").trim();
  if (!v) return "Unknown";
  return v.replaceAll("_", " ");
}

export default async function Page() {
  const user = await getCurrentUser();
  const counts = await getCounts();
  const activity = await getActivity();
  const rep = await getReputationSummary();

  const recentApps = activity?.recentApplications || [];
  const recentThreads = activity?.recentThreads || [];

  return (
    <>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>Dashboard</h2>
          <p className={styles.meta}>
            Signed in as <strong>{user?.email}</strong>.
          </p>
        </div>

        <div className={styles.actionsRow}>
          <Link className={`${styles.button} ${styles.buttonPrimary}`.trim()} href="/requester/requests/new">
            New request
          </Link>
          <Link className={styles.button} href="/requester/messages">
            Inbox
          </Link>
        </div>
      </div>
      <div
        className={styles.banner}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 10 }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Interested in helping others, too?</div>
          <div className={styles.small} style={{ margin: 0 }}>
            Your requests come first—but if you have a moment, you can browse opportunities and support someone nearby.
          </div>
        </div>
        <Link className={styles.button} href="/opportunities" style={{ whiteSpace: "nowrap" }}>
          Browse opportunities
        </Link>
      </div>


      <div className={styles.grid}>
        <Link className={styles.tileLink} href="/requester/requests">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Active requests</h3>
            <p className={styles.tileBody}>{counts.activeRequests}</p>
          </div>
        </Link>

        <div className={styles.tile}>
          <h3 className={styles.tileTitle}>Pending applications</h3>
          <p className={styles.tileBody}>{counts.pendingApplications}</p>
        </div>

        <div className={styles.tile}>
          <h3 className={styles.tileTitle}>Upcoming</h3>
          <p className={styles.tileBody}>{counts.upcoming}</p>
        </div>

        <Link className={styles.tileLink} href="/requester/messages">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Unread messages</h3>
            <p className={styles.tileBody}>{counts.unreadThreads}</p>
          </div>
        </Link>

        <Link className={styles.tileLink} href="/requester/reputation">
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Reputation</h3>
            <p className={styles.tileBody}>
              {rep ? (
                <>
                  <Stars rating={rep.received.average_rating} /> {rep.received.average_rating.toFixed(1)}
                </>
              ) : (
                "—"
              )}
            </p>
            <p className={styles.meta} style={{ margin: 0 } as any}>
              {rep ? `${rep.received.count} reviews received · ${rep.given.count} given` : "Unable to load reputation"}
            </p>
          </div>
        </Link>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.row}>
            <h3 className={styles.sectionTitle}>New applications</h3>
            <Link className={styles.navLink} href="/requester/requests">
              View all requests
            </Link>
          </div>

          {recentApps.length === 0 ? (
            <p className={styles.meta}>No new applications yet.</p>
          ) : (
            <div className={styles.list}>
              {recentApps.map((a) => (
                <Link key={a.application_id} className={styles.tileLink} href={`/requester/requests/${a.request_id}`}>
                  <div className={styles.tile}>
                    <div className={styles.row}>
                      <h4 className={styles.tileTitle}>{a.request_title || "Request"}</h4>
                      <span className={styles.small}>{formatWhen(a.created_at)}</span>
                    </div>
                    <p className={styles.tileBody}>
                      From <strong>{a.volunteer_display_name || a.volunteer_email}</strong> · {formatStatus(a.status)}
                    </p>
                    {a.message ? <p className={styles.meta}>{a.message}</p> : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.row}>
            <h3 className={styles.sectionTitle}>Recent messages</h3>
            <Link className={styles.navLink} href="/requester/messages">
              Open inbox
            </Link>
          </div>

          {recentThreads.length === 0 ? (
            <p className={styles.meta}>No conversations yet.</p>
          ) : (
            <div className={styles.list}>
              {recentThreads.map((t) => (
                <Link
                  key={`${t.peer_id}-${t.request_id || "none"}-${t.application_id || "none"}`}
                  className={styles.tileLink}
                  href={threadHref(t)}
                >
                  <div className={styles.tile}>
                    <div className={styles.row}>
                      <h4 className={styles.tileTitle}>{t.peer_display_name || t.peer_email}</h4>
                      <span className={styles.small}>{formatWhen(t.last_at)}</span>
                    </div>
                    {t.request_title ? <p className={styles.meta}>Regarding: {t.request_title}</p> : null}
                    <p className={styles.tileBody}>{t.last_body}</p>
                    {t.unread_count > 0 ? (
                      <div className={styles.badges}>
                        <span className={styles.badge}>Unread: {t.unread_count}</span>
                      </div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}




