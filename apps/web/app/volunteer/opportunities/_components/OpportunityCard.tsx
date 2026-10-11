"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../../volunteer.module.css";

export type OpportunityListItem = {
  id: string;
  title: string;
  summary: string;
  location: string;
  mode: "in-person" | "remote" | "hybrid";
  organization_name: string | null;
  tags: string[];

  // Optional enrichments returned by certain endpoints
  distance_miles?: number | null;
  recommendation_reason?: string | null;
  saved_at?: string | null;
};

function modeLabel(mode: OpportunityListItem["mode"]) {
  if (mode === "in-person") return "In-person";
  if (mode === "remote") return "Remote";
  return "Hybrid";
}

export default function OpportunityCard({
  opportunity,
  showUnsave = false,
  onUnsave,
  unsaveBusy = false
}: {
  opportunity: OpportunityListItem;
  showUnsave?: boolean;
  unsaveBusy?: boolean;
  onUnsave?: (id: string) => void;
}) {
  const router = useRouter();
  const detailsHref = `/volunteer/opportunities/${opportunity.id}`;
  const distance = typeof opportunity.distance_miles === "number" && Number.isFinite(opportunity.distance_miles)
    ? opportunity.distance_miles
    : null;

  function openDetails() {
    router.push(detailsHref);
  }

  return (
    <article
      className={styles.tile}
      role="link"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetails();
        }
      }}
      aria-label={`View details for ${opportunity.title}`}
      style={{ cursor: "pointer" } as any}
    >
      <div className={styles.tileHeaderRow}>
        <Link
          className={styles.tileTitleLink}
          href={detailsHref}
          onClick={(e) => e.stopPropagation()}
        >
          <p className={styles.tileTitle}>{opportunity.title}</p>
        </Link>

        {showUnsave ? (
          <button
            type="button"
            className={`${styles.iconButton} ${styles.iconButtonDanger}`}
            disabled={unsaveBusy}
            onClick={(e) => {
              e.stopPropagation();
              onUnsave?.(opportunity.id);
            }}
            aria-label="Unsave"
            title="Unsave"
          >
            {unsaveBusy ? "…" : "Unsave"}
          </button>
        ) : null}
      </div>

      <p className={styles.meta} style={{ marginTop: "0.35rem" } as any}>
        {opportunity.organization_name ? `${opportunity.organization_name} · ` : ""}
        {modeLabel(opportunity.mode)}
        {distance !== null ? ` · ${distance.toFixed(1)} mi` : ""}
        {opportunity.location ? ` · ${opportunity.location}` : ""}
      </p>

      {opportunity.recommendation_reason ? (
        <p className={styles.meta} style={{ marginTop: "0.25rem" } as any}>
          <span className={styles.pill}>Recommended</span> {opportunity.recommendation_reason}
        </p>
      ) : null}

      {opportunity.saved_at ? (
        <p className={styles.meta} style={{ marginTop: "0.25rem" } as any}>
          Saved {new Date(opportunity.saved_at).toLocaleString()}
        </p>
      ) : null}

      <p className={styles.tileBody}>{opportunity.summary}</p>

      {opportunity.tags?.length ? (
        <div className={styles.badges} aria-label="Tags">
          {opportunity.tags.slice(0, 6).map((t) => (
            <span key={t} className={styles.badge}>
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.tileFooterRow}>
        <Link className={styles.viewDetailsLink} href={detailsHref} onClick={(e) => e.stopPropagation()}>
          View details
        </Link>
      </div>
    </article>
  );
}


