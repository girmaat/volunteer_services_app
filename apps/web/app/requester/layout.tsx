import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../lib/backend";
import styles from "./requester.module.css";
import RequesterTabs from "./_components/RequesterTabs";

export const dynamic = "force-dynamic";

export default async function RequesterLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboarding_completed) redirect("/onboarding");
  if (user.role !== "requester") redirect("/dashboard");

  // Org-mode: org team members should not use the individual requester area.
  const org = await backendFetch("/v1/org/me", { method: "GET" });
  if (org.ok) redirect("/org/dashboard");

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Requester</h1>
        <p className={styles.subtitle}>Manage your requests, applications, and messages.</p>
      </header>

      <RequesterTabs />

      <div className={styles.card}>{children}</div>
    </section>
  );
}


