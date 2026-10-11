import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../requester.module.css";

export const dynamic = "force-dynamic";

type PendingApplication = {
  application_id: string;
  request_id: string;
  request_title: string;
  status: string;
  message: string | null;
  created_at: string;
  updated_at: string;
  volunteer_user_id: string;
  volunteer_email: string;
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
  volunteer_bio: string | null;
  volunteer_verification_status: string | null;
};

async function loadPending(): Promise<PendingApplication[]> {
  const res = await backendFetch("/v1/requester/applications/pending", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load pending applications");
  }
  return (await res.json()) as PendingApplication[];
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default async function Page() {
  const user = await getCurrentUser();
  const apps = await loadPending();

  return (
    <>
      <div className={styles.row}>
        <div>
          <h1 className={styles.sectionTitle}>Applications</h1>
          <p className={styles.meta}>
            Pending volunteer applications across your requests. Signed in as <strong>{user?.email}</strong>.
          </p>
        </div>

        <div className={`${styles.actionsRow} mt-0`}>
          <Link prefetch={false} className={styles.navLink} href="/requester/requests">
            View requests
          </Link>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>No pending applications</p>
          <p className={styles.bannerBody}>When volunteers apply to your requests, they’ll show up here.</p>
        </div>
      ) : null}

      <div className={styles.list} aria-label="Pending applications">
        {apps.map((a) => (
          <Link prefetch={false} key={a.application_id} className={styles.tileLink} href={`/requester/requests/${a.request_id}/applications`}>
            <div className={styles.tile}>
              <div className={styles.row}>
                <h2 className={styles.tileTitle}>{a.volunteer_display_name || a.volunteer_email}</h2>
                <span className={styles.small}>{formatWhen(a.created_at)}</span>
              </div>

              <p className={styles.tileBody}>
                Applied to <strong>{a.request_title}</strong>
                {a.message ? ` — “${a.message}”` : ""}
              </p>

              {a.volunteer_public_location ? (
                <div className={styles.badges}>
                  <span className={styles.badge}>{a.volunteer_public_location}</span>
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
