import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../settings.module.css";

export const dynamic = "force-dynamic";

type PrivacySettings = {
  public_profile_visible: boolean;
  messaging_permission: "anyone" | "verified_only" | "no_one";
  updated_at: string | null;
};

async function getPrivacySettings(): Promise<PrivacySettings> {
  const res = await backendFetch("/v1/settings/privacy-safety", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load privacy settings");
  return (await res.json()) as PrivacySettings;
}

export default async function Page(
  props: {
    searchParams?: Promise<{ saved?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const [user, settings] = await Promise.all([getCurrentUser(), getPrivacySettings()]);
  if (!user) redirect("/login");

  async function saveSettings(formData: FormData) {
    "use server";

    const public_profile_visible = !!formData.get("public_profile_visible");
    const messaging_permission = String(formData.get("messaging_permission") || "anyone") as PrivacySettings["messaging_permission"];

    const res = await backendFetch("/v1/settings/privacy-safety", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ public_profile_visible, messaging_permission })
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as any;
      const msg = data?.message || "Failed to save privacy settings.";
      redirect("/settings/privacy-safety?error=" + encodeURIComponent(msg));
    }

    const me = await getCurrentUser();
    if (me?.id) {
      if (me.role === "volunteer") revalidatePath(`/volunteers/${me.id}`);
      if (me.role === "requester") revalidatePath(`/requesters/${me.id}`);
    }

    revalidatePath("/settings/privacy-safety");
    revalidatePath("/settings");
    redirect("/settings/privacy-safety?saved=1");
  }

  return (
    <>
      <h2 className={styles.sectionTitle}>Privacy &amp; Safety</h2>
      <p className={styles.meta}>
        Control what appears on your public profile, and who can message you.
      </p>

      {searchParams?.saved ? (
        <div className={styles.badgeRow}>
          <span className={styles.badge}>Saved</span>
        </div>
      ) : null}

      {searchParams?.error ? (
        <div className={styles.badgeRow}>
          <span className={styles.badge}>Could not save</span>
          <span className={styles.badge}>{searchParams.error}</span>
        </div>
      ) : null}

      <form className="mt-3" action={saveSettings}>
        <div className={styles.tile}>
          <h3 className={styles.tileTitle}>Public profile visibility</h3>
          <p className={styles.tileBody}>
            When off, your public profile link will show as unavailable to others.
          </p>

          <label className={`${styles.label} flex items-center gap-2.5`}>
            <input type="checkbox" name="public_profile_visible" defaultChecked={!!settings.public_profile_visible} />
            Public profile is visible
          </label>

          <p className={`${styles.small} mt-2`}>
            Your public profile link:{" "}
            <code>{user.role === "volunteer" ? `/volunteers/${user.id}` : user.role === "requester" ? `/requesters/${user.id}` : ""}</code>
          </p>
        </div>

        <div className={`${styles.tile} mt-3.5`}>
          <h3 className={styles.tileTitle}>Messaging permissions</h3>
          <p className={styles.tileBody}>
            Choose who can send you direct messages. This is enforced at the API level.
          </p>

          <div className={`${styles.row} mt-2.5`}>
            <label className={`${styles.label} font-semibold`}>
              <input className="mr-1.5"
                type="radio"
                name="messaging_permission"
                value="anyone"
                defaultChecked={settings.messaging_permission === "anyone"} 
              />
              Anyone
              <div className={styles.small}>Any logged-in user can message you (unless blocked).</div>
            </label>

            <label className={`${styles.label} font-semibold`}>
              <input className="mr-1.5"
                type="radio"
                name="messaging_permission"
                value="verified_only"
                defaultChecked={settings.messaging_permission === "verified_only"} 
              />
              Verified users only
              <div className={styles.small}>Only users with a verified email can message you.</div>
            </label>

            <label className={`${styles.label} font-semibold`}>
              <input className="mr-1.5"
                type="radio"
                name="messaging_permission"
                value="no_one"
                defaultChecked={settings.messaging_permission === "no_one"} 
              />
              No one
              <div className={styles.small}>No one can start or continue a conversation with you.</div>
            </label>
          </div>
        </div>

        <div className={`${styles.row} mt-3.5`}>
          <button className={styles.button} type="submit">
            Save changes
          </button>
          <Link className={styles.buttonSecondary} href="/settings">
            Back to settings
          </Link>
        </div>
      </form>
    </>
  );
}
