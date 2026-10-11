import styles from "../../requester.module.css";
import { backendFetch } from "../../../lib/backend";
import ReputationTabs from "../_components/ReputationTabs";

export const dynamic = "force-dynamic";

type GivenReviewRow = {
  id: string;
  rating: number;
  strengths: string | null;
  improvements: string | null;
  would_work_again: boolean | null;
  created_at: string;
  request_title: string | null;
  volunteer_name: string;
};

type ReviewsResponse = { count: number; reviews: GivenReviewRow[] };

async function getReviews(): Promise<{ ok: true; data: ReviewsResponse } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/requester/history/reviews-given", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load reviews" };
  }
  return { ok: true, data: (await res.json()) as ReviewsResponse };
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span aria-label={`Rating: ${r} out of 5`}>
      {"★".repeat(r)}
      {"☆".repeat(5 - r)}
    </span>
  );
}

export default async function Page() {
  const resp = await getReviews();

  return (
    <>
      <h2 className={styles.sectionTitle}>Reviews given</h2>

      <ReputationTabs active="given" />

      {!resp.ok && (
        <div className={styles.sectionCard}>
          <p style={{ fontWeight: 800, margin: 0 }}>Could not load reviews.</p>
          <p className={styles.meta} style={{ marginTop: "0.35rem" } as any}>
            Backend responded with {resp.status}. {resp.message}
          </p>
        </div>
      )}

      {resp.ok && (
        <>
          <p className={styles.meta}>{resp.data.count} total</p>

          {resp.data.count === 0 ? (
            <div className={styles.sectionCard}>
              <p className={styles.meta}>
                No reviews given yet. After you mark an engagement completed, you can review the volunteer.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: "0.75rem" } as any}>
              {resp.data.reviews.map((r) => (
                <div key={r.id} className={styles.sectionCard}>
                  <div style={{ fontWeight: 800 }}>
                    <Stars rating={r.rating} /> {r.rating}/5
                  </div>
                  <p className={styles.meta}>
                    {r.volunteer_name} · {new Date(r.created_at).toLocaleDateString()}
                    {r.request_title ? ` · ${r.request_title}` : ""}
                  </p>

                  {r.strengths ? (
                    <p className={styles.meta} style={{ marginTop: "0.45rem" } as any}>
                      {r.strengths}
                    </p>
                  ) : null}

                  {r.improvements ? (
                    <p className={styles.meta} style={{ marginTop: "0.45rem" } as any}>
                      <strong>Could be better:</strong> {r.improvements}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
