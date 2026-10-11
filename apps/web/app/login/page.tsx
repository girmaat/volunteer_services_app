import Link from "next/link";
import { cookies } from "next/headers";
import styles from "../(auth)/auth.module.css";

export const dynamic = "force-dynamic";

type SearchParams = {
  ok?: string;
  returnTo?: string;
};

function decodeCookie(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function Page(props: { searchParams?: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const jar = await cookies();

  const flashError = jar.get("ty_flash_error")?.value || "";
  const error = flashError ? decodeCookie(flashError) : "";
  const showVerifyHelp = Boolean(error) && error.toLowerCase().includes("verify");

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Log in</h1>
        <p className={styles.subtitle}>Access your account and continue onboarding.</p>
      </header>

      <div className={styles.card}>
        {error ? <div className={styles.error}>{error}</div> : null}
        {searchParams?.ok === "reset" ? (
          <div className={styles.success}>Password updated. You can log in now.</div>
        ) : null}

        <form className={styles.form} method="post" action="/api/auth/login">
          {searchParams?.returnTo ? (
            <input type="hidden" name="returnTo" value={String(searchParams.returnTo)} />
          ) : null}
          <label className={styles.label}>
            Email
            <input className={styles.input} name="email" type="email" autoComplete="email" required />
          </label>

          <label className={styles.label}>
            Password
            <input className={styles.input} name="password" type="password" autoComplete="current-password" required />
          </label>

          <div className={styles.buttonRow}>
            <button className={styles.button} type="submit">Log in</button>
            <Link className={styles.meta} href="/forgot-password">Forgot password?</Link>
            <Link className={styles.meta} href="/signup">Create account</Link>
          </div>
        </form>

        {showVerifyHelp ? (
          <div style={{ marginTop: 12 }}>
            <div className={styles.meta}>
              Your email isn&apos;t verified yet. Please verify your email before logging in.
            </div>
            <div className={styles.meta}>
              If you are in local dev, you can use the verification link from the signup response.
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}