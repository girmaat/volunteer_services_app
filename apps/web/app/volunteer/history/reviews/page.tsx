import Link from "next/link";
import { backendFetch } from "../../../lib/backend";
import styles from "../../volunteer.module.css";
import HistoryTabs from "../_components/HistoryTabs";

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  rating: number;
  strengths: string | null;
  improvements: string | null;
  would_work_again: boolean | null;
  created_at: string;
  request_id: string | null;
  request_application_id: string | null;
  request_title: string | null;
  organization_name: string | null;
  reviewer_name: string;
};

type ReviewsResponse = { average_rating: number; count: number; reviews: ReviewRow[] };

async function getReviews(): Promise<{ ok: true; data: ReviewsResponse } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/reviews", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load reviews" };
  }
  return { ok: true, data: (await res.json()) as ReviewsResponse };
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return <span aria-label={`Rating: ${r} out of 5`}>{"★".repeat(r)}{"☆".repeat(5 - r)}</span>;
}

export default async function Page() {
  const resp = await getReviews();

  return (
    <>
      <h1 className={styles.sectionTitle}>Reviews received</h1>
      <HistoryTabs active="reviews" />

      {!resp.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>Could not load reviews.</strong>
          <div className={styles.meta}>
            Backend responded with {resp.status}. {resp.message}
          </div>
        </div>
      )}

      {resp.ok && (
        <>
          <div className={styles.card}>
            <div className={styles.row}>
              <div>
                <div className={styles.meta}>Average rating</div>
                <div className="text-xl font-extrabold">
                  <Stars rating={resp.data.average_rating} /> {resp.data.average_rating.toFixed(1)}
                </div>
              </div>
              <div className={styles.badges}>
                <span className={styles.badge}>{resp.data.count} total</span>
              </div>
            </div>
          </div>

          {resp.data.reviews.length === 0 && <p className={styles.meta}>No reviews yet.</p>}

          {resp.data.reviews.length > 0 && (
            <div className={styles.list}>
              {resp.data.reviews.map((r) => (
                <div key={r.id} className={styles.card}>
                  <div className={styles.row}>
                    <div>
                      <div className="font-extrabold">
                        <Stars rating={r.rating} /> {r.rating}/5
                      </div>
                      <div className={styles.meta}>
                        {r.reviewer_name} · {new Date(r.created_at).toLocaleDateString()}
                      </div>
                      <div className={styles.meta}>
                        {r.request_title || "Unknown opportunity"} {r.organization_name ? `· ${r.organization_name}` : ""}
                      </div>
                    </div>

                    <div className={styles.actionsRow}>
                      {r.request_application_id && (
                        <Link prefetch={false} className={styles.button} href={`/volunteer/applications/${r.request_application_id}`}>
                          View application
                        </Link>
                      )}
                      {r.request_id && (
                        <Link prefetch={false} className={styles.button} href={`/volunteer/opportunities/${r.request_id}`}>
                          View opportunity
                        </Link>
                      )}
                    </div>
                  </div>

                  {r.strengths && (
                    <div className="mt-3">
                      <div className={`${styles.meta} font-bold`}>
                        What went well
                      </div>
                      <p className={styles.cardBody}>{r.strengths}</p>
                    </div>
                  )}

                  {r.improvements && (
                    <div className="mt-3">
                      <div className={`${styles.meta} font-bold`}>
                        Could improve
                      </div>
                      <p className={styles.cardBody}>{r.improvements}</p>
                    </div>
                  )}

                  {r.would_work_again !== null && (
                    <div className={`${styles.badges} mt-3`}>
                      <span className={styles.badge}>{r.would_work_again ? "Would work again" : "Would not work again"}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
