import styles from "../../requester.module.css";
import { backendFetch } from "../../../lib/backend";
import ReputationTabs from "../_components/ReputationTabs";

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  rating: number;
  strengths: string | null;
  improvements: string | null;
  would_work_again: boolean | null;
  created_at: string;
  request_title: string | null;
  reviewer_name: string;
};

type ReviewsResponse = { average_rating: number; count: number; reviews: ReviewRow[] };

async function getReviews(): Promise<ReviewsResponse> {
  const res = await backendFetch("/v1/requester/history/reviews", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load reviews");
  return (await res.json()) as ReviewsResponse;
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return <span aria-label={`Rating: ${r} out of 5`}>{"★".repeat(r)}{"☆".repeat(5 - r)}</span>;
}

export default async function Page() {
  const data = await getReviews();

  return (
    <>
      <h1 className={styles.sectionTitle}>Reviews received</h1>
      <p className={styles.meta}>
        <Stars rating={data.average_rating} /> {data.average_rating.toFixed(1)} · {data.count} total
      </p>

      <ReputationTabs active="received" />

      {data.count === 0 ? (
        <div className={styles.sectionCard}>
          <p className={styles.meta}>No reviews yet. Once volunteers mark engagements completed, they can leave feedback here.</p>
        </div>
      ) : (
        <div className="mt-3">
          {data.reviews.map((r) => (
            <div key={r.id} className={styles.sectionCard}>
              <div className="font-extrabold">
                <Stars rating={r.rating} /> {r.rating}/5
              </div>
              <p className={styles.meta}>
                {r.reviewer_name} · {new Date(r.created_at).toLocaleDateString()}
                {r.request_title ? ` · ${r.request_title}` : ""}
              </p>

              {r.strengths ? (
                <div className="mt-2">
                  <div className={`${styles.meta} font-bold`}>
                    What went well
                  </div>
                  <p className={`${styles.meta} mt-1`}>
                    {r.strengths}
                  </p>
                </div>
              ) : null}

              {r.improvements ? (
                <div className="mt-2">
                  <div className={`${styles.meta} font-bold`}>
                    What could be better
                  </div>
                  <p className={`${styles.meta} mt-1`}>
                    {r.improvements}
                  </p>
                </div>
              ) : null}

              {typeof r.would_work_again === "boolean" ? (
                <p className={`${styles.meta} mt-2`}>
                  Would work again: <strong>{r.would_work_again ? "Yes" : "No"}</strong>
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
