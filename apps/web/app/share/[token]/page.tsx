import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { backendFetch } from "../../lib/backend";
import styles from "./page.module.css";
import ReportThisLink from "./report-this-link";

export const dynamic = "force-dynamic";

type SharePreview = {
  token: string;
  title: string;
  summary: string;
  cta_label: string;
  cta_href: string;
  moderation_state?: string | null;
  report_count?: number | null;
  first_reported_at?: string | null;
  revoked_reason?: string | null;
  is_reported?: boolean | null;
  share_type?: string | null;
  coarse_location: string | null;
  time_window: any | null;
  verification_status: string | null;
  image_url: string | null;
  requires_login: boolean;
  is_expired: boolean;
  is_revoked: boolean;
  viewer_can_view_details?: boolean;
};

const KICKER: Record<string, string> = {
  OPPORTUNITY: "Shared opportunity",
  SERVICE_REQUEST: "Shared opportunity",
  ORGANIZATION: "Shared organization",
  IMPACT_STORY: "Shared impact story",
  PUBLIC_PAGE: "Shared page",
  INVITE: "Invitation"
};

async function fetchPreview(token: string): Promise<SharePreview> {
  // Use backendFetch so a signed-in viewer's ty_session cookie is forwarded as an Authorization header.
  // This fixes "Logged-in users" share links showing the anonymous "Sign in" preview for already-authenticated users.
  const res = await backendFetch(`/v1/shares/${encodeURIComponent(token)}`, { method: "GET", cache: "no-store" });
  if (res.status === 404) notFound();
  if (!res.ok) {
    // Treat any other failure as not found to avoid leaking details.
    notFound();
  }
  return (await res.json()) as SharePreview;
}

function formatNeededBy(timeWindow: any): string | null {
  const raw = timeWindow?.needed_by;
  if (!raw) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export async function generateMetadata(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const token = String(params.token || "");
  const preview = await fetchPreview(token);

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const base = `${proto}://${host}`;

  const title = preview?.title ? String(preview.title) : "Shared link";
  const description = preview?.summary ? String(preview.summary) : "Open to view details.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: new URL(`/share/${encodeURIComponent(token)}/opengraph-image`, base).toString(),
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL(`/share/${encodeURIComponent(token)}/opengraph-image`, base).toString()],
    },
  };
}

export default async function Page(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const token = String(params.token || "");
  const preview = await fetchPreview(token);

  const viewerCanViewDetails = preview.viewer_can_view_details !== false;

  const moderationState = String(preview.moderation_state || "").toLowerCase();
  const isBlocked = Boolean(preview.is_revoked) || moderationState === "blocked";
  const reportCount = Number(preview.report_count || 0);
  const isReported = Boolean(preview.is_reported) || moderationState === "reported" || reportCount > 0;

  const showDetails = Boolean(viewerCanViewDetails) && !preview.is_expired && !isBlocked;

  const neededBy = showDetails ? formatNeededBy(preview.time_window) : null;
  const isVerified = showDetails && String(preview.verification_status || "") === "verified";
  const unavailable = preview.is_expired || isBlocked;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.kicker}>{KICKER[String(preview.share_type || "")] || "Shared from Volunteer Services"}</div>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{preview.title}</h1>
          {isVerified ? <span className={styles.badge}>Verified</span> : null}
        </div>

        {isBlocked ? (
          <div className={styles.blockedBanner}>
            <strong>This link is unavailable.</strong> It may have been blocked by moderators or revoked by the creator.
          </div>
        ) : isReported ? (
          <div className={styles.warningBanner}>
            <strong>Use caution:</strong> this link has been reported by community members.{' '}
            <span className={styles.mutedInline}>Reports: {reportCount}</span>
          </div>
        ) : null}

        {preview.summary ? <p className={styles.summary}>{preview.summary}</p> : null}

        {showDetails ? (
          <div className={styles.metaRow}>
            {preview.coarse_location ? <div className={styles.meta}><span className={styles.metaLabel}>Location:</span> {preview.coarse_location}</div> : null}
            {neededBy ? <div className={styles.meta}><span className={styles.metaLabel}>When:</span> {neededBy}</div> : null}
          </div>
        ) : null}
      </header>

      <div className={styles.card}>
        <div className={styles.cardTitle}>{unavailable ? "This link is no longer available" : preview.share_type === "INVITE" ? "Join Volunteer Services" : "Ready to help?"}</div>
        <p className={styles.cardBody}>
          {unavailable
            ? "The owner has revoked this link or it has expired."
            : preview.share_type === "INVITE"
              ? "Create a free account to volunteer or ask for help."
              : "Open it on Volunteer Services to see the full details."}
        </p>
        {preview.is_expired ? <div className={styles.notice}>This link has expired.</div> : null}
        {preview.is_revoked ? <div className={styles.notice}>This link has been revoked.</div> : null}

        <div className={styles.actions}>
          {unavailable ? (
            <span className={styles.ctaDisabled}>Link unavailable</span>
          ) : (
            <Link prefetch={false} className={styles.cta} href={preview.cta_href}>
              {preview.cta_label}
            </Link>
          )}

          <Link prefetch={false} className={styles.secondary} href="/opportunities">
            Browse opportunities
          </Link>

          <ReportThisLink token={preview.token} />
        </div>

        {preview.requires_login && !showDetails ? (
          <div className={styles.loginHint}>
            Some details are hidden. Sign in to view the full preview and open the shared content.
          </div>
        ) : null}
      </div>
    </section>
  );
}

