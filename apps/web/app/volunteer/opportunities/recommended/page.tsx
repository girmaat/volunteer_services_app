import styles from "../../volunteer.module.css";
import OpportunityTabs from "../_components/OpportunityTabs";
import OpportunityCard, { type OpportunityListItem } from "../_components/OpportunityCard";
import { backendFetch } from "../../../lib/backend";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function load(): Promise<{
  opportunities: OpportunityListItem[];
  radiusMiles: number;
  label: string;
  error?: string;
}> {
  const returnTo = "/volunteer/opportunities/recommended";
  const res = await backendFetch("/v1/volunteer/opportunities/recommended", { method: "GET" });

  if (res.status === 401) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  if (res.status === 403) {
    let msg = "";
    try {
      const data = (await res.json()) as any;
      msg = typeof data?.message === "string" ? data.message : "";
    } catch {
      try {
        msg = await res.text();
      } catch {
        msg = "";
      }
    }

    if (msg.toLowerCase().includes("onboarding")) {
      redirect(`/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }

  if (!res.ok) {
    let msg = "";
    try {
      const data = (await res.json()) as any;
      msg = typeof data?.message === "string" ? data.message : "";
    } catch {
      try {
        msg = await res.text();
      } catch {
        msg = "";
      }
    }

    const safe = msg?.trim() ? msg.trim() : `Request failed (HTTP ${res.status})`;
    return { opportunities: [], radiusMiles: 25, label: "", error: safe };
  }

  const radiusMiles = Number(res.headers.get("x-volunteer-radius-miles") || 25);
  const label = String(res.headers.get("x-volunteer-location-label") || "");

  const opportunities = (await res.json()) as OpportunityListItem[];
  return { opportunities, radiusMiles, label };
}


export default async function Page() {
  const { opportunities, radiusMiles, label, error } = await load();

  return (
    <div>
      <div className={styles.row}>
        <div>
          <h1 className={styles.sectionTitle}>Recommended opportunities</h1>
          <p className={styles.meta}>
            Personalized ranking using your interests (tags), experience text similarity, and distance when available
            {label ? ` (within ~${radiusMiles} mi of ${label})` : ""}.
          </p>
        </div>
        <div className={styles.small}>{error ? "—" : opportunities.length} total</div>
      </div>

      {error ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>Couldn&apos;t load opportunities</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : null}

      <OpportunityTabs />


      {!error && opportunities.length === 0 ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>No opportunities found</p>
          <p className={styles.bannerBody}>Try another tab, or update your profile tags/experience for better matches.</p>
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
