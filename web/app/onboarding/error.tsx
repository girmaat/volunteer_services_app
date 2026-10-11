"use client";

import styles from "../(auth)/auth.module.css";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Onboarding</h1>
        <p className={styles.subtitle}>Something went wrong.</p>
      </header>

      <div className={styles.card}>
        <div className={styles.error}>{error.message}</div>
        <div className={styles.buttonRow} style={{ marginTop: "0.8rem" }}>
          <button className={styles.button} onClick={() => reset()}>Try again</button>
          <Link className={styles.meta} href="/onboarding">Back</Link>
        </div>
      </div>
    </section>
  );
}
