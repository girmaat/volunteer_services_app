
import styles from "../../volunteer.module.css";
import OpportunityTabs from "../_components/OpportunityTabs";
import OpportunityCard, { type OpportunityListItem } from "../_components/OpportunityCard";
import { backendFetch } from "../../../lib/backend";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function load(): Promise<{ opportunities: OpportunityListItem[]; error?: string }> {
  const returnTo = "/volunteer/opportunities/remote";
  const res = await backendFetch("/v1/volunteer/opportunities/remote", { method: "GET" });

  if (res.status === 401) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  if (!res.ok) {
    let msg = "";
    try {
      const data = (await res.json()) as any;
      msg = typeof data?.message === "string" ? data.message : "";
    } catch {
      msg = "";
    }
    return { opportunities: [], error: msg || res.statusText || "Internal server error" };
  }

  return { opportunities: (await res.json()) as OpportunityListItem[] };
}

export default async function Page() {
  const { opportunities, error } = await load();

  return (
    <div>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>Remote opportunities</h2>
          <p className={styles.meta}>Remote and hybrid opportunities (DB-backed).</p>
        </div>
        <div className={styles.small}>{error ? "—" : opportunities.length} total</div>
      </div>

      <OpportunityTabs />

      {error ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>Couldn&apos;t load opportunities</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : opportunities.length === 0 ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>No opportunities found</p>
          <p className={styles.bannerBody}>Try another tab or adjust your onboarding availability settings.</p>
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


