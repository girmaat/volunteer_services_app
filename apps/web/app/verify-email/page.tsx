import { API_BASE_URL_SERVER } from "@thankyou/config";
import styles from "../(auth)/auth.module.css";

export const dynamic = "force-dynamic";

/**
 * Opening the link only checks it; the button verifies. Email link scanners open links too, and
 * would otherwise use the link up before the person clicks it.
 */
export default async function Page(props: { searchParams?: Promise<{ token?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const token = searchParams?.token || "";
  let error = searchParams?.error || "";
  let email = "";
  if (token && !error) {
    const r = await fetch(`${API_BASE_URL_SERVER}/v1/auth/verify-email?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { email?: string; message?: string } | null;
    if (!r || !r.ok) error = j?.message || "This link has expired or was already used";
    else email = j?.email || "";
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Verify email</h1>
        <p className={styles.subtitle}>{email ? `Confirm ${email} is yours.` : "Finish verifying your email address."}</p>
      </header>

      <div className={styles.card}>
        {error ? (
          <div className={styles.error}>{error}</div>
        ) : !token ? (
          <div className={styles.error}>Missing token.</div>
        ) : (
          <form className={styles.form} method="post" action="/api/auth/verify-email">
            <input type="hidden" name="token" value={token} />
            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit">
                Verify my email
              </button>
            </div>
            <p className={styles.meta}>If you didn’t create a ThankYou account, ignore this page and the email.</p>
          </form>
        )}
      </div>
    </section>
  );
}
