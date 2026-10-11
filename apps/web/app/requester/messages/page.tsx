import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../requester.module.css";

export const dynamic = "force-dynamic";

type InboxThread = {
  request_id: string | null;
  application_id: string | null;
  request_title: string | null;
  peer_id: string;
  peer_email: string;
  peer_display_name: string | null;
  peer_avatar_url: string | null;
  peer_public_location: string | null;

  last_body: string;
  last_at: string;
  unread_count: number;
};

async function getInbox(): Promise<InboxThread[]> {
  const res = await backendFetch("/v1/requester/messages/inbox", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load messages inbox");
  }
  return (await res.json()) as InboxThread[];
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}



function threadHref(t: InboxThread) {
  const qs = new URLSearchParams();
  if (t.request_id) qs.set("requestId", t.request_id);
  if (t.application_id) qs.set("applicationId", t.application_id);
  const q = qs.toString();
  return `/requester/messages/${t.peer_id}` + (q ? `?${q}` : "");
}

export default async function Page() {
  const user = await getCurrentUser();
  const inbox = await getInbox();

  return (
    <>
      <h2 className={styles.sectionTitle}>Messages</h2>
      <p className={styles.meta}>
        Signed in as <strong>{user?.email}</strong>.
      </p>

      {inbox.length === 0 ? (
        <div className={styles.tile}>
          <h3 className={styles.tileTitle}>Inbox</h3>
          <p className={styles.tileBody}>No message threads yet.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {inbox.map((t) => (
            <Link key={`${t.peer_id}-${t.request_id || "none"}-${t.application_id || "none"}`} className={styles.tileLink} href={threadHref(t)}>
              <div className={styles.tile}>
                <div className={styles.row}>
                  <h3 className={styles.tileTitle}>{t.peer_display_name || t.peer_email}</h3>
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
    </>
  );
}

