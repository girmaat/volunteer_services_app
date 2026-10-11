
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { backendFetch } from "../../lib/backend";
import styles from "../settings.module.css";

export const dynamic = "force-dynamic";

type Peer = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  public_location: string | null;
};

type BlockRow = {
  blocked_user_id: string;
  blocked_display_name: string | null;
  blocked_avatar_url: string | null;
  blocked_public_location: string | null;
  reason: string | null;
  blocked_at: string;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function getReportables() {
  const res = await backendFetch("/v1/settings/reportables", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load reportables");
  const data = (await res.json()) as any;
  return { peers: (data?.peers as Peer[]) || [] };
}

async function getBlockedUsers(): Promise<BlockRow[]> {
  const res = await backendFetch("/v1/settings/blocked-users", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load blocked users");
  return (await res.json()) as BlockRow[];
}

export default async function Page() {
  const [{ peers }, blocked] = await Promise.all([getReportables(), getBlockedUsers()]);

  async function blockUser(formData: FormData) {
    "use server";

    const blocked_user_id = String(formData.get("blocked_user_id") || "").trim() || undefined;
    const email = String(formData.get("email") || "").trim() || undefined;
    const reason = String(formData.get("reason") || "").trim() || undefined;

    const res = await backendFetch("/v1/settings/blocked-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blocked_user_id, email, reason })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body || "Failed to block user");
    }

    revalidatePath("/settings/blocked-users");
    revalidatePath("/settings");
    revalidatePath("/inbox");
    revalidatePath("/inbox");
  }

  async function unblockUser(formData: FormData) {
    "use server";

    const blockedUserId = String(formData.get("blocked_user_id") || "").trim();
    if (!blockedUserId) return;

    const res = await backendFetch(`/v1/settings/blocked-users/${blockedUserId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to unblock user");

    revalidatePath("/settings/blocked-users");
    revalidatePath("/settings");
    revalidatePath("/inbox");
    revalidatePath("/inbox");
  }

  return (
    <>
      <h2 className={styles.sectionTitle}>Blocked users</h2>
      <p className={styles.meta}>
        Blocking someone prevents messages in either direction, and hides conversations from your inbox.
      </p>

      <form action={blockUser}>
        <div className={styles.row}>
          <label className={`${styles.label} flex-1`}>
            Select from recent people
            <select name="blocked_user_id" className={styles.select} defaultValue="">
              <option value="">— Select —</option>
              {peers.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.display_name || p.email) + " (" + p.email + ")"}
                </option>
              ))}
            </select>
          </label>

          <label className={`${styles.label} flex-1`}>
            Or block by email
            <input name="email" className={styles.input} placeholder="name@example.com" />
          </label>
        </div>

        <label className={styles.label}>
          Reason (optional)
          <textarea name="reason" className={styles.textarea} placeholder="Add a note for yourself (optional)" />
        </label>

        <div className={`${styles.row} mt-3`}>
          <button className={styles.button} type="submit">
            Block user
          </button>
          <Link className={styles.buttonSecondary} href="/settings">
            Back to settings
          </Link>
        </div>
      </form>

      <hr className={styles.hr} />

      {blocked.length === 0 ? (
        <p className={styles.meta}>You haven’t blocked anyone yet.</p>
      ) : (
        <div className={styles.list}>
          {blocked.map((b) => (
            <div key={b.blocked_user_id} className={styles.tile}>
              <h3 className={styles.tileTitle}>{b.blocked_display_name}</h3>
              <p className={styles.tileBody}>
                {b.blocked_public_location || "Location not shared"}
              </p>

              <div className={styles.badgeRow}>
                <span className={styles.badge}>Blocked {formatWhen(b.blocked_at)}</span>
                {b.reason ? <span className={styles.badge}>Note: {b.reason}</span> : null}
              </div>

              <form className="mt-3" action={unblockUser}>
                <input type="hidden" name="blocked_user_id" value={b.blocked_user_id} />
                <button className={styles.buttonSecondary} type="submit">
                  Unblock
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
