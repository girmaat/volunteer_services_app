import Link from "next/link";
import { backendFetch } from "../../lib/backend";
import styles from "../requester.module.css";
import ReputationTabs from "./_components/ReputationTabs";

export const dynamic = "force-dynamic";

type ReputationSummary = {
  received: { average_rating: number; count: number };
  given: { count: number };
};

async function getSummary(): Promise<ReputationSummary> {
  const res = await backendFetch("/v1/requester/reputation/summary", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load reputation");
  return (await res.json()) as ReputationSummary;
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return <span aria-label={`Rating: ${r} out of 5`}>{"★".repeat(r)}{"☆".repeat(5 - r)}</span>;
}

export default async function Page() {
  const summary = await getSummary();

  return (
    <>
      <h1 className={styles.sectionTitle}>Reputation</h1>
      <p className={styles.meta}>See the reviews you’ve received as a requester and the reviews you’ve given to volunteers.</p>

      <ReputationTabs active="overview" />

      <div className={`${styles.grid} mt-3.5`}>
        <Link className={styles.tileLink} href="/requester/reputation/reviews">
          <div className={styles.tile}>
            <div className={styles.tileTitle}>Reviews received</div>
            <div className={styles.tileNumber}>
              <Stars rating={summary.received.average_rating} /> {summary.received.average_rating.toFixed(1)}
            </div>
            <div className={styles.tileBody}>{summary.received.count} total</div>
          </div>
        </Link>

        <Link className={styles.tileLink} href="/requester/reputation/reviews-given">
          <div className={styles.tile}>
            <div className={styles.tileTitle}>Reviews given</div>
            <div className={styles.tileNumber}>{summary.given.count}</div>
            <div className={styles.tileBody}>Sent to volunteers</div>
          </div>
        </Link>
      </div>
    </>
  );
}
