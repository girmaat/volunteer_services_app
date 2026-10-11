import Link from "next/link";
import { revalidatePath } from "next/cache";
import { backendFetch } from "../../lib/backend";
import styles from "../settings.module.css";

export const dynamic = "force-dynamic";

type NotificationItem = {
  id: string;
  type: "message" | "new_application" | "application_update" | "review_received";
  created_at: string;
  seen: boolean;
  title: string;
  body: string;
  href: string | null;
};

type NotificationsResponse = {
  last_seen_at: string;
  unseen_count: number;
  notifications: NotificationItem[];
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function getNotifications(): Promise<NotificationsResponse> {
  const res = await backendFetch("/v1/settings/notifications", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load notifications");
  return (await res.json()) as NotificationsResponse;
}

export default async function Page() {
  const data = await getNotifications();
  const unseen = Number(data.unseen_count || 0);

  async function markAllSeen() {
    "use server";

    const res = await backendFetch("/v1/settings/notifications/mark-all-seen", { method: "POST" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body || "Failed to mark all as seen");
    }

    revalidatePath("/settings/notifications");
    revalidatePath("/settings");
  }

  return (
    <>
      <h2 className={styles.sectionTitle}>Notifications</h2>
      <p className={styles.meta}>
        Your feed is generated from real activity: messages received, application activity, and reviews received.
      </p>

      <div className={styles.row} style={{ alignItems: "center" } as any}>
        <span className={styles.badge}>Unseen: {unseen}</span>
        <span className={styles.small}>Last seen: {formatWhen(data.last_seen_at)}</span>
      </div>

      <div className={styles.row} style={{ marginTop: "0.75rem" } as any}>
        <form action={markAllSeen}>
          <button className={styles.button} type="submit" disabled={unseen === 0}>
            Mark all as seen
          </button>
        </form>
        <Link className={styles.buttonSecondary} href="/settings">
          Back to settings
        </Link>
      </div>

      <hr className={styles.hr} />

      {data.notifications.length === 0 ? (
        <p className={styles.meta}>No notifications yet.</p>
      ) : (
        <div className={styles.list}>
          {data.notifications.map((n) => {
            const content = (
              <div className={styles.tile}>
                <div className={styles.row} style={{ justifyContent: "space-between", alignItems: "baseline" } as any}>
                  <h3 className={styles.tileTitle}>{n.title}</h3>
                  <span className={styles.small}>{formatWhen(n.created_at)}</span>
                </div>
                <p className={styles.tileBody}>{n.body}</p>
                <div className={styles.badgeRow}>
                  {!n.seen ? <span className={styles.badge}>New</span> : <span className={styles.badge}>Seen</span>}
                  <span className={styles.badge}>Type: {n.type.replace(/_/g, " ")}</span>
                </div>
              </div>
            );

            if (n.href) {
              return (
                <Link key={n.id} href={n.href} style={{ textDecoration: "none" } as any}>
                  {content}
                </Link>
              );
            }

            return <div key={n.id}>{content}</div>;
          })}
        </div>
      )}
    </>
  );
}
