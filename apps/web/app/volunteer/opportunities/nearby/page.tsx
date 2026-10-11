import Link from "next/link";

import styles from "../../volunteer.module.css";
import OpportunityTabs from "../_components/OpportunityTabs";
import OpportunityCard, { type OpportunityListItem } from "../_components/OpportunityCard";
import { backendFetch } from "../../../lib/backend";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function load(radius?: string): Promise<{
  opportunities: OpportunityListItem[];
  locationMissing: boolean;
  radiusMiles: number;
  label: string;
  error?: string;
}> {
  const qs = radius ? `?radius=${encodeURIComponent(radius)}` : "";
  const returnTo = `/volunteer/opportunities/nearby${qs}`;
  const res = await backendFetch(`/v1/volunteer/opportunities/nearby${qs}`, { method: "GET" });

  if (res.status === 401) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const locationMissing = (res.headers.get("x-volunteer-location-missing") || "") === "1";
  const radiusMiles = Number(res.headers.get("x-volunteer-radius-miles") || radius || 25);
  const label = String(res.headers.get("x-volunteer-location-label") || "");

  if (!res.ok) {
    let msg = "";
    try {
      const data = (await res.json()) as any;
      msg = typeof data?.message === "string" ? data.message : "";
    } catch {
      msg = "";
    }
    return { opportunities: [], locationMissing, radiusMiles, label, error: msg || res.statusText || "Internal server error" };
  }

  const opportunities = (await res.json()) as OpportunityListItem[];
  return { opportunities, locationMissing, radiusMiles, label };
}

const radiusOptions = [5, 10, 25, 50, 100];

export default async function Page(
  props: {
    searchParams?: Promise<{ radius?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const { opportunities, locationMissing, radiusMiles, label, error } = await load(searchParams?.radius);

  return (
    <div>
      <div className={styles.row}>
        <div>
          <h1 className={styles.sectionTitle}>Nearby opportunities</h1>
          <p className={styles.meta}>
            {locationMissing
              ? "Set a public location in your profile to see truly nearby opportunities."
              : `Within ${radiusMiles || 25} miles of ${label || "your location"}.`}
          </p>
        </div>
        <div className={styles.small}>{error ? "—" : opportunities.length} total</div>
      </div>

      <OpportunityTabs />

      {error ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>Couldn&apos;t load opportunities</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : locationMissing ? (
        <div className={`${styles.banner} ${styles.bannerInfo}`}>
          <p className={styles.bannerTitle}>Location needed</p>
          <p className={styles.bannerBody}>
            Add a city/neighborhood in <Link href="/volunteer/profile">Profile</Link> so we can calculate distance. We
            never show an exact address.
          </p>
        </div>
      ) : (
        <div className={styles.subnav} aria-label="Radius">
          {radiusOptions.map((r) => {
            const active = String(searchParams?.radius || "") === String(r);
            return (
              <Link
                key={r}
                className={`${styles.subnavLink} ${active ? styles.subnavLinkActive : ""}`}
                href={`/volunteer/opportunities/nearby?radius=${r}`}
              >
                {r} mi
              </Link>
            );
          })}
        </div>
      )}

      {(!error && !locationMissing && opportunities.length === 0) ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>No nearby opportunities found</p>
          <p className={styles.bannerBody}>Try increasing your radius, or check the Remote tab.</p>
        </div>
      ) : null}

      <div className={styles.grid}>
        {opportunities.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} />
        ))}
      </div>
    </div>
  );
}


