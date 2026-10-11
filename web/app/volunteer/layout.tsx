import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import styles from "./volunteer.module.css";
import VolunteerNav from "./VolunteerNav";

export const dynamic = "force-dynamic";

export default async function VolunteerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboarding_completed) redirect("/onboarding");
  if (user.role !== "volunteer") redirect("/dashboard");

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Volunteer</h1>
        <p className={styles.subtitle}>Your volunteer tools and activity.</p>
      </header>

      <VolunteerNav />

      <div className={styles.card}>{children}</div>
    </section>
  );
}
