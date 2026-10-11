import Link from "next/link";
import { backendFetch, getCurrentUser } from "../lib/backend";
import styles from "./dashboard.module.css";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type OrgMeResponse = {
  org?: {
    onboarding_completed?: boolean;
  };
};

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <h1 className={styles.title}>Welcome</h1>
          <p className={styles.lead}>Please sign in to access your dashboard.</p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/login">
              Log in
            </Link>
            <Link className={styles.secondaryAction} href="/signup">
              Sign up
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const accountType = String((user as any).account_type || "");
  const requesterMode = String((user as any).requester_mode || "");

  // Organization-requester accounts establish org context via /org/signup.
  // They should never reach the generic dashboard before doing so.
  const isOrgRequester =
    user.role === "requester" && (requesterMode === "organization" || accountType === "requester_org");

  // Org team members also should not land on the generic dashboard.
  const isOrgTeamMember = user.role === "org_admin" || accountType === "org_team_member";

  if (isOrgRequester) {
    redirect("/org/signup");
  }

  if (isOrgTeamMember) {
    const res = await backendFetch("/v1/org/me", { method: "GET" });

    if (res.status === 401) redirect("/login");

    // No org context yet (or not allowed) => take them to org signup to establish org context.
    if (res.status === 403 || res.status === 404) redirect("/org/signup");

    if (res.ok) {
      const ctx = (await res.json().catch(() => null)) as OrgMeResponse | null;
      const done = Boolean(ctx?.org?.onboarding_completed);
      redirect(done ? "/org/dashboard" : "/org/onboarding");
    }

    // Any other unexpected failure: fall back to org signup to recover.
    redirect("/org/signup");
  }

  // Non-org users must complete onboarding before reaching the dashboard.
  if (!user.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.lead}>
          Signed in as <strong>{user.email}</strong>.
        </p>
      </section>

      <section className={styles.grid}>
        {user.role === "volunteer" ? (
          <Link className={styles.card} href="/volunteer">
            <h2 className={styles.cardTitle}>Volunteer</h2>
            <p className={styles.cardBody}>Browse opportunities, track commitments, and manage your profile.</p>
          </Link>
        ) : null}

        {user.role === "requester" ? (
          <Link className={styles.card} href="/requester/dashboard">
            <h2 className={styles.cardTitle}>Requests</h2>
            <p className={styles.cardBody}>Create and manage requests, view applications, and message volunteers.</p>
          </Link>
        ) : null}

        <Link className={styles.card} href="/settings">Saved fields
          <h2 className={styles.cardTitle}>Settings</h2>
          <p className={styles.cardBody}>Account settings, notifications, privacy & safety, blocks, and reports.</p>
        </Link>
      </section>
    </main>
  );
}


