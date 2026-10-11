import type { ReactNode } from "react";
import { getCurrentUser } from "../lib/backend";
import { getOrgContext } from "../lib/org";
import OrgNav from "./_components/OrgNav";
import styles from "./org.module.css";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  // Public org routes (e.g., /org/signup) should be reachable while logged out.
  if (!user) {
    return (
      <section className={styles.page}>
        <main className={styles.mainFull}>{children}</main>
      </section>
    );
  }

  // For any logged-in user, attempt to load org context.
  // If present, render the org shell; otherwise, allow public org pages to render.
  const orgCtx = await getOrgContext();
  if (!orgCtx) {
    return (
      <section className={styles.page}>
        <main className={styles.mainFull}>{children}</main>
      </section>
    );
  }

  const verificationStatus = String((orgCtx as any)?.org?.verification_status || "");
  const verificationRequired = Boolean((orgCtx as any)?.org?.verification_required);

  const verificationLabel =
    verificationStatus === "approved" || verificationStatus === "verified"
      ? "Verified"
      : verificationRequired
        ? "Verification required"
        : verificationStatus
          ? verificationStatus
          : "Unverified";

  return (
    <section className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerCard}>
            <div className={styles.headerTop}>
              <div className={styles.orgTitleWrap}>
                <h1 className={styles.orgName}>{orgCtx.org.name}</h1>
                <p className={styles.orgMeta}>
                  {orgCtx.org.location} · <span className={styles.badge}>{orgCtx.membership.role}</span> ·{" "}
                  <span className={styles.badge}>{verificationLabel}</span>
                </p>
              </div>

                            {verificationRequired && verificationStatus !== "approved" && verificationStatus !== "verified" ? (
                <div className={styles.verificationCallout} role="note">
                  <div className={styles.verificationCalloutTitle}>Verification required</div>
                  <div className={styles.verificationCalloutBody}>
                    Submit your organization&apos;s verification details in{" "}
                    <a className={styles.verificationLink} href="/org/settings#verification">
                      Organization settings
                    </a>
                    . After you submit, a platform admin will review and update your status.
                  </div>
                </div>
              ) : null}
            </div>

            <OrgNav />
          </div>
        </header>

        <main className={styles.main}>{children}</main>
      </div>
    </section>
  );
}