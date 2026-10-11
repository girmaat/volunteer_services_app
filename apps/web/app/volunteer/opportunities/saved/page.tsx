import styles from "../../volunteer.module.css";
import OpportunityTabs from "../_components/OpportunityTabs";
import { type OpportunityListItem } from "../_components/OpportunityCard";
import SavedOpportunitiesClient from "./SavedOpportunitiesClient";
import { backendFetch } from "../../../lib/backend";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function load(): Promise<{ opportunities: OpportunityListItem[]; error?: string }> {
  const returnTo = "/volunteer/opportunities/saved";
  const res = await backendFetch("/v1/volunteer/opportunities/saved", { method: "GET" });

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
          <h1 className={styles.sectionTitle}>Saved opportunities</h1>
          <p className={styles.meta}>Opportunities you’ve saved (DB-backed).</p>
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
          <p className={styles.bannerBody}>Browse other tabs, or use “Unsave” here to remove items quickly.</p>
        </div>
      ) : null}

      <SavedOpportunitiesClient initial={opportunities} />
    </div>
  );
}



