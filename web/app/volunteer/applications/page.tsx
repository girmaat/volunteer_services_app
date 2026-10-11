import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../volunteer.module.css";

export const dynamic = "force-dynamic";

type ApplicationRow = {
  id: string;
  opportunity_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  title: string;
  summary: string;
  location: string;
  mode: "in-person" | "remote" | "hybrid";
  organization_name: string | null;
};

async function getApplications(): Promise<ApplicationRow[]> {
  const res = await backendFetch("/v1/volunteer/applications", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load applications");
  }
  return (await res.json()) as ApplicationRow[];
}

export default async function VolunteerApplicationsPage() {
  const [user, applications] = await Promise.all([getCurrentUser(), getApplications()]);

  return (
    <>
      <h2 className={styles.sectionTitle}>Applications</h2>
      <p className={styles.meta}>
        Signed in as <strong>{user?.email}</strong>.
      </p>

      {applications.length === 0 ? (
        <div className={styles.tile}>
          <p className={styles.tileBody}>No applications yet.</p>
          <p className={styles.meta}>
            Browse <Link href="/opportunities">opportunities</Link> to apply.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {applications.map((a) => (
            <div key={a.id} className={styles.tile}>
              <Link href={`/volunteer/applications/${a.id}`} className={styles.rowTitleLink}>
                <h3 className={styles.tileTitle}>{a.title}</h3>
              </Link>

              <p className={styles.meta} style={{ marginTop: "0.35rem" } as any}>
                {a.organization_name ? a.organization_name : "Independent requester"} · {a.mode} · {a.location}
              </p>

              {a.summary ? <p className={styles.tileBody}>{a.summary}</p> : null}

              <div className={styles.badges}>
                <span className={styles.badge}>Status: {a.status}</span>
                <span className={styles.badge}>Last updated: {new Date(a.updated_at).toLocaleString()}</span>
              </div>

              <p className={styles.meta}>
                <Link href={`/opportunities/${a.opportunity_id}`}>View opportunity</Link> ·{" "}
                <Link href={`/volunteer/applications/${a.id}`}>Open application</Link>
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
