import { forwardHeaders } from "../../lib/forward";
import styles from "../(auth)/auth.module.css";
import Link from "next/link";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function resetAction(formData: FormData) {
  "use server";

  const payload = {
    token: String(formData.get("token") || ""),
    password: String(formData.get("password") || "")
  };

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Reset failed");
  }

  redirect("/login?ok=reset");
}

export default async function Page(props: { searchParams?: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  const token = searchParams?.token || "";

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Reset password</h1>
        <p className={styles.subtitle}>Choose a new password.</p>
      </header>

      <div className={styles.card}>
        {!token ? (
          <div className={styles.error}>Missing reset token. Use the link from your email.</div>
        ) : (
          <form className={styles.form} action={resetAction}>
            <input type="hidden" name="token" value={token} />

            <label>
              <div className={styles.meta}>New password (min 8 chars)</div>
              <input className={styles.input} name="password" type="password" minLength={8} required />
            </label>

            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit">Update password</button>
              <Link prefetch={false} className={styles.meta} href="/login">Back to log in</Link>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
