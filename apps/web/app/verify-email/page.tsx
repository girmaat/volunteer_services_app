import styles from "../(auth)/auth.module.css";

export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams?: Promise<{ token?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const token = searchParams?.token || "";
  const error = searchParams?.error || "";

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Verify email</h1>
        <p className={styles.subtitle}>Finishing email verification…</p>
      </header>

      <div className={styles.card}>
        {error ? (
          <div className={styles.error}>{decodeURIComponent(error)}</div>
        ) : !token ? (
          <div className={styles.error}>Missing token.</div>
        ) : (
          <>
            <meta httpEquiv="refresh" content={`0; url=/api/auth/verify-email?token=${encodeURIComponent(token)}`} />
            <div className={styles.meta}>
              Redirecting… If nothing happens, open:{" "}
              <a href={`/api/auth/verify-email?token=${encodeURIComponent(token)}`}>Verify now</a>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
