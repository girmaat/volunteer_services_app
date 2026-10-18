import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import styles from "../../(auth)/auth.module.css";

export const metadata = { title: "Enter your code" };
export const dynamic = "force-dynamic";

function decode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Second sign-in step for accounts with two-step sign-in on. */
export default async function Page() {
  const jar = await cookies();
  if (!jar.get("ty_mfa")?.value) redirect("/login");
  const error = decode(jar.get("ty_flash_error")?.value || "");
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Enter your code</h1>
        <p className={styles.subtitle}>Open your authenticator app and type the 6-digit code for Volunteer Services.</p>
      </header>
      <div className={styles.card}>
        {error ? <div className={styles.error}>{error}</div> : null}
        <form className={styles.form} method="post" action="/api/auth/mfa">
          <label className={styles.label}>
            Code
            <input className={styles.input} name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={20} />
          </label>
          <div className={styles.buttonRow}>
            <button className={styles.button} type="submit">
              Continue
            </button>
            <Link prefetch={false} className={styles.meta} href="/login">
              Start over
            </Link>
          </div>
        </form>
        <p className={styles.meta}>Lost your phone? Type one of your recovery codes instead.</p>
      </div>
    </section>
  );
}
