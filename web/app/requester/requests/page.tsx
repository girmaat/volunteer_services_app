import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../requester.module.css";

export const dynamic = "force-dynamic";

type ActiveRequestRow = {
  id: string;
  title: string;
  description: string;
  status: "open" | "paused" | "closed" | string;
  updated_at: string;
  applicants: number;
  confirmed: number;
};

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

async function loadActiveRequests(): Promise<ActiveRequestRow[]> {
  const res = await backendFetch("/v1/requester/requests/active", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load active requests");
  return (await res.json()) as ActiveRequestRow[];
}

async function loadAllMyRequests(): Promise<RequestRow[]> {
  const res = await backendFetch("/v1/requester/requests", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load requests");
  return (await res.json()) as RequestRow[];
}

function statusLabel(s: string) {
  if (s === "open") return "Open";
  if (s === "paused") return "Paused";
  if (s === "closed") return "Closed";
  return s;
}

function statusClass(s: string) {
  if (s === "open") return styles.statusOpen;
  if (s === "paused") return styles.statusPaused;
  if (s === "closed") return styles.statusClosed;
  return "";
}

function noun(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural;
}

function modeLabel(mode: string | null) {
  if (!mode) return "Remote";
  if (mode === "in-person") return "In-person";
  if (mode === "remote") return "Remote";
  if (mode === "hybrid") return "Hybrid";
  return mode;
}

type TabKey = "active" | "all" | "new";

function normalizeTab(value: unknown): TabKey {
  if (value === "all") return "all";
  if (value === "new") return "new";
  return "active";
}

export default async function Page({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const user = await getCurrentUser();

  const tab = normalizeTab(typeof searchParams?.tab === "string" ? searchParams?.tab : undefined);

  const [activeRes, allRes] = await Promise.all([
    loadActiveRequests()
      .then((data) => ({ data, error: null as Error | null }))
      .catch((e) => ({ data: [] as ActiveRequestRow[], error: e as Error })),
    loadAllMyRequests()
      .then((data) => ({ data, error: null as Error | null }))
      .catch((e) => ({ data: [] as RequestRow[], error: e as Error }))
  ]);

  const active = activeRes.data;
  const activeErr = activeRes.error;
  const all = allRes.data;
  const allErr = allRes.error;

  const hasSignedIn = !!user?.email;

  const activeCountLabel = activeErr ? "" : ` (${active.length})`;
  const allCountLabel = allErr ? "" : ` (${all.length})`;

  return (
    <>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>Requests</h2>
          <p className={styles.meta}>
            Create requests for help and track volunteers.
            {hasSignedIn ? (
              <>
                {" "}Signed in as <strong>{user!.email}</strong>.
              </>
            ) : null}
          </p>
        </div>

        <div className={styles.actionsRow} style={{ marginTop: 0 } as any}>
          <Link className={`${styles.button} ${styles.buttonPrimary}`.trim()} href="/requester/requests/new">
            New request
          </Link>
        </div>
      </div>

      <div className={styles.nav} aria-label="Request views">
        <Link
          className={`${styles.navLink} ${tab === "active" ? styles.navActive : ""}`.trim()}
          href="/requester/requests"
        >
          My Active Requests{activeCountLabel}
        </Link>
        <Link
          className={`${styles.navLink} ${tab === "all" ? styles.navActive : ""}`.trim()}
          href="/requester/requests?tab=all"
        >
          All My Requests{allCountLabel}
        </Link>
      </div>

      {tab === "new" ? (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>Create a new request</h3>
          <p className={styles.meta}>
            Share what you need help with, where it is, and when. Volunteers will be able to apply and message you.
          </p>

          <div className={styles.actionsRow} style={{ marginTop: "0.9rem" } as any}>
            <Link className={`${styles.button} ${styles.buttonPrimary}`.trim()} href="/requester/requests/new">
              Start a new request
            </Link>
            <Link className={styles.navLink} href="/requester/dashboard">
              Go to dashboard
            </Link>
          </div>
        </div>
      ) : null}

      {tab === "active" ? (
        <>
          <div className={styles.row} style={{ marginTop: "0.8rem" } as any}>
            <div>
              <h3 className={styles.sectionTitle}>My Active Requests</h3>
              <p className={styles.meta}>Requests you’ve created that volunteers can apply to.</p>
            </div>
          </div>

          {activeErr ? (
            <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
              <p className={styles.bannerTitle}>Couldn&apos;t load active requests</p>
              <p className={styles.bannerBody}>{activeErr.message}</p>
            </div>
          ) : null}

          {!activeErr && active.length === 0 ? (
            <div className={styles.banner}>
              <p className={styles.bannerTitle}>No active requests yet</p>
              <p className={styles.bannerBody}>Create a request to make it visible to volunteers.</p>
            </div>
          ) : null}

          <div className={styles.list} aria-label="My active requests">
            {active.map((r) => (
              <Link key={r.id} className={styles.tileLink} href={`/requester/requests/${r.id}`}>
                <div className={styles.tile}>
                  <div className={styles.row}>
                    <h4 className={styles.tileTitle} style={{ margin: 0 } as any}>
                      {r.title}
                    </h4>
                    <span className={`${styles.badge} ${statusClass(r.status)}`.trim()}>{statusLabel(r.status)}</span>
                  </div>

                  <p className={styles.tileBody}>{r.description}</p>

                  <div className={styles.badges} aria-label="Applicants and confirmed volunteers">
                    <span className={styles.badge}>
                      {r.applicants} {noun(r.applicants, "applicant", "applicants")} / {r.confirmed}{" "}
                      {noun(r.confirmed, "confirmed", "confirmed")}
                    </span>
                    <span className={styles.badge} title={new Date(r.updated_at).toLocaleString()}>
                      Updated {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {tab === "all" ? (
        <>
          <div className={styles.row} style={{ marginTop: "0.8rem" } as any}>
            <div>
              <h3 className={styles.sectionTitle}>All My Requests</h3>
              <p className={styles.meta}>Every request you’ve created (including closed).</p>
            </div>
          </div>

          {allErr ? (
            <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
              <p className={styles.bannerTitle}>Couldn&apos;t load your requests</p>
              <p className={styles.bannerBody}>{allErr.message}</p>
            </div>
          ) : null}

          {!allErr && all.length === 0 ? (
            <div className={styles.banner}>
              <p className={styles.bannerTitle}>No requests yet</p>
              <p className={styles.bannerBody}>Your requests will show here once you create them.</p>
            </div>
          ) : null}

          <div className={styles.list} aria-label="All my requests">
            {all.map((r) => (
              <Link key={r.id} className={styles.tileLink} href={`/requester/requests/${r.id}`}>
                <div className={styles.tile}>
                  <div className={styles.row}>
                    <h4 className={styles.tileTitle} style={{ margin: 0 } as any}>
                      {r.title}
                    </h4>
                    <span className={`${styles.badge} ${statusClass(r.status)}`.trim()}>{statusLabel(r.status)}</span>
                  </div>

                  <p className={styles.meta} style={{ marginTop: "0.35rem" } as any}>
                    {modeLabel(r.mode)} · {r.location || "—"}
                    {r.needed_by ? ` · Needed by ${new Date(r.needed_by).toLocaleDateString()}` : ""}
                  </p>

                  <p className={styles.tileBody}>{r.summary}</p>

                  <div className={styles.badges} aria-label="Updated date">
                    <span className={styles.badge} title={new Date(r.updated_at).toLocaleString()}>
                      Updated {new Date(r.updated_at).toLocaleDateString()}
                    </span>
                    <span className={styles.badge} title={new Date(r.created_at).toLocaleString()}>
                      Created {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
