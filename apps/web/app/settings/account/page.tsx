import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import styles from "../settings.module.css";

export const dynamic = "force-dynamic";

function cleanMessage(s: string) {
  return s.replace(/\+/g, " ").trim();
}

export default async function Page(
  props: {
    searchParams?: Promise<{ ok?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();

  const ok = searchParams?.ok === "1";
  const error = searchParams?.error ? cleanMessage(String(searchParams.error)) : "";

  async function changePasswordAction(formData: FormData) {
    "use server";

    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      redirect("/settings/account?error=" + encodeURIComponent("Please fill out all fields."));
    }
    if (newPassword.length < 8) {
      redirect("/settings/account?error=" + encodeURIComponent("New password must be at least 8 characters."));
    }
    if (newPassword !== confirmPassword) {
      redirect("/settings/account?error=" + encodeURIComponent("New passwords do not match."));
    }

    const res = await backendFetch("/v1/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as any;
      const msg = String(data?.message || "Failed to change password");
      redirect("/settings/account?error=" + encodeURIComponent(msg));
    }

    redirect("/settings/account?ok=1");
  }

  return (
    <>
      <h2 className={styles.sectionTitle}>Account</h2>
      <p className={styles.meta}>
        Change your password securely. After a successful change, we keep you signed in on this device and sign you out
        everywhere else.
      </p>

      {user?.email ? (
        <div className={styles.badgeRow} style={{ marginTop: "0.25rem" } as any}>
          <span className={styles.badge}>Signed in as: {user.email}</span>
        </div>
      ) : null}

      {ok ? (
        <div
          className={styles.tile}
          style={{ borderColor: "var(--border)", background: "#ecfdf5", marginTop: "0.9rem" } as any}
        >
          <strong>Password updated.</strong>
          <div className={styles.small} style={{ marginTop: "0.35rem" } as any}>
            Your other sessions have been signed out.
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          className={styles.tile}
          style={{ borderColor: "var(--border)", background: "#fef2f2", marginTop: "0.9rem" } as any}
        >
          <strong>Could not update password.</strong>
          <div className={styles.small} style={{ marginTop: "0.35rem" } as any}>
            {error}
          </div>
        </div>
      ) : null}

      <hr className={styles.hr} />

      <form action={changePasswordAction}>
        <label className={styles.label} htmlFor="currentPassword">
          Current password
        </label>
        <input className={styles.input} id="currentPassword" name="currentPassword" type="password" required />

        <label className={styles.label} htmlFor="newPassword">
          New password
        </label>
        <input className={styles.input} id="newPassword" name="newPassword" type="password" minLength={8} required />

        <label className={styles.label} htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input className={styles.input} id="confirmPassword" name="confirmPassword" type="password" minLength={8} required />

        <div className={styles.row} style={{ marginTop: "0.9rem" } as any}>
          <button className={styles.button} type="submit">
            Update password
          </button>
          <Link className={styles.buttonSecondary} href="/forgot-password">
            Forgot password?
          </Link>
          <Link className={styles.buttonSecondary} href="/settings">
            Back to settings
          </Link>
        </div>
      </form>
    </>
  );
}
