import Link from "next/link";
import { backendFetch, getCurrentUser } from "../lib/backend";
import ShareButton from "../_components/share/ShareButton";
import styles from "./settings.module.css";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getCurrentUser();
  
  const [unseen, blocked, reports, privacy] = await Promise.all([
    backendFetch("/v1/settings/notifications/unseen-count", { method: "GET" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    backendFetch("/v1/settings/blocked-users/count", { method: "GET" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    backendFetch("/v1/settings/reports/count", { method: "GET" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    backendFetch("/v1/settings/privacy-safety", { method: "GET" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const unseenCount = Number(unseen?.unseen_count ?? 0) || 0;
  const blockedCount = Number(blocked?.blocked_count ?? 0) || 0;
  const reportsCount = Number(reports?.reports_count ?? 0) || 0;
  const reportsOpen = Number(reports?.reports_open ?? 0) || 0;

  const publicProfileVisible = privacy?.public_profile_visible;
  const messagingPermission = privacy?.messaging_permission;

  const suggestedNextStep =
    !me?.email_verified_at
      ? "Verify your email to improve trust and unlock more sharing options."
      : unseenCount > 0
        ? "You have new activity—check Notifications to keep conversations moving."
        : me?.verification_required && me?.verification_status !== "approved"
          ? "Complete verification to build confidence for people you help nearby."
          : "You're all set—invite a friend to help grow your local support network.";

  return (
    <>
      <h2 className={styles.sectionTitle}>Overview</h2>
      <p className={styles.meta}>A quick look at your account, privacy and safety settings.</p>

            <div className={styles.overviewGrid}>
        <div className={styles.overviewLeft}>
        <div className={styles.tile}>
          <h3 className={styles.tileTitle}>Account snapshot</h3>
          <p className={styles.tileBody}>Signed in as <strong>{me?.email || ""}</strong>.</p>

          <div className={styles.badgeRow}>
            <span className={styles.badge}>{me?.role ? `Role: ${me.role}` : "Role: —"}</span>
            <span className={styles.badge}>{me?.email_verified_at ? "Email verified" : "Email not verified"}</span>
            <a href="/settings/verification" className={styles.badge}>
              {me?.verification_status === "approved" ? "Verified" : me?.verification_status === "submitted" ? "Verification in review" : "Get verified"}
            </a>
          </div>

          <p className={`${styles.small} ${styles.accountHint}`}>
            Suggested next step: <strong>{suggestedNextStep}</strong>
          </p>

          <div className={styles.accountActions}>
            <Link prefetch={false} className={styles.buttonSecondary} href="/settings/account">
              Account
            </Link>
            <Link prefetch={false} className={styles.buttonSecondary} href="/settings/privacy-safety">
              Privacy &amp; Safety
            </Link>
          </div>
        </div>

        

<div className={styles.tile}>
          <h3 className={styles.tileTitle}>At a glance</h3>
          <div className={styles.stats}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{unseenCount}</div>
              <div className={styles.statLabel}>Unseen notifications</div>
              <Link prefetch={false} className={styles.statLink} href="/settings/notifications">View</Link>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{blockedCount}</div>
              <div className={styles.statLabel}>Blocked users</div>
              <Link prefetch={false} className={styles.statLink} href="/settings/blocked-users">Manage</Link>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{reportsCount}</div>
              <div className={styles.statLabel}>Reports filed</div>
              <div className={styles.small}>{reportsOpen > 0 ? `${reportsOpen} open` : "No open reports"}</div>
              <Link prefetch={false} className={styles.statLink} href="/settings/reports">View</Link>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{publicProfileVisible === false ? "Private" : "Visible"}</div>
              <div className={styles.statLabel}>Public profile</div>
              <div className={styles.small}>
                Messages: {messagingPermission ? String(messagingPermission).replace(/_/g, " ") : "—"}
              </div>
              <Link prefetch={false} className={styles.statLink} href="/settings/privacy-safety">Adjust</Link>
            </div>
          </div>
        </div>

        
        </div>

        <div className={styles.overviewRight}>
{me?.id ? (
          <div className={styles.tile}>
            <h3 className={styles.tileTitle}>Invite friends</h3>
            <p className={styles.tileBody}>Generate a shareable invite link for someone new to join Volunteer Services.</p>
            <div className="mt-3">
              <ShareButton
                target={{ type: "invite", ref: me.id, title: "Invite friends" }}
                label="Generate invite link"
                className={styles.button}
              />
            </div>
          </div>
        ) : (
          <Link prefetch={false} className={styles.tile} href="/login">
            <h3 className={styles.tileTitle}>Invite friends</h3>
            <p className={styles.tileBody}>Sign in to generate an invite link.</p>
          </Link>
        )}
        </div>
      </div>
    </>
  );
}





