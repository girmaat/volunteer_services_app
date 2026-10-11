
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import styles from "./settings.module.css";
import { SettingsNav } from "./SettingsNav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboarding_completed) redirect("/onboarding");

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Your account safety and trust controls.</p>
      </header>

      <SettingsNav />

      <div className={styles.card}>{children}</div>
    </section>
  );
}
