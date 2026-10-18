import { idCheckLabel, replyTimeLabel } from "../../../lib/format";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import styles from "../../volunteers/public.module.css";

export const dynamic = "force-dynamic";

type RequesterReviewRow = {
  id: string;
  rating: number;
  strengths: string | null;
  improvements: string | null;
  would_work_again: boolean | null;
  created_at: string;
  request_id: string | null;
  request_title: string | null;
  reviewer_name: string;
};

type PublicRequester = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  public_location: string | null;
  bio: string | null;
  languages: string[];
  interaction_tags: string[];
  availability_windows: string[];
  need_categories: string[];
  need_help_prompt: string | null;
  reviews_as_requester: { average_rating: number; count: number; recent: RequesterReviewRow[] };
  logistics: {
    parking_available: boolean | null;
    elevator_available: boolean | null;
    stairs_present: boolean | null;
    pickup_vs_dropoff: string | null;
    time_flexibility: string | null;
  };
  household: {
    pets_at_home: boolean | null;
    smoke_free: boolean | null;
    accessibility_needs: string | null;
  };
  safety_preferences: {
    meet_in_public_first: boolean | null;
    someone_else_present: boolean | null;
    mask_preferred: boolean | null;
  };
  verification: {
    email_verified: boolean;
    phone_verified: boolean;
    id_verification_status: string | null;
  };
  stats: {
    completed_commitments_count: number;
    cancellation_rate: number | null;
    typical_response_time_seconds: number | null;
    thank_you_notes_count: number;
  };
};

async function getRequester(id: string): Promise<PublicRequester | null> {
  const base = process.env.API_BASE_URL_SERVER || "http://localhost:4202";
  const res = await fetch(`${base}/v1/public/requesters/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load requester profile");
  return (await res.json()) as PublicRequester;
}

function formatPercent(v: number | null) {
  if (v === null || !isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function boolLabel(v: boolean | null) {
  if (v === null) return "—";
  return v ? "Yes" : "No";
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

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const data = await getRequester(params.id).catch(() => null);
  return { title: data?.display_name ? `${data.display_name} • Requester` : "Requester profile" };
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const data = await getRequester(params.id);
  if (!data) return notFound();

  const avgRating = Number(data?.reviews_as_requester?.average_rating || 0);
  const reviewCount = Number(data?.reviews_as_requester?.count || 0);
  const recent = Array.isArray(data?.reviews_as_requester?.recent) ? data.reviews_as_requester.recent : [];

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.avatar}>
          {data.avatar_url ? (
            <Image src={data.avatar_url} alt="" width={96} height={96} className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarFallback} aria-hidden="true">
              {data.display_name?.[0]?.toUpperCase() || "R"}
            </div>
          )}
        </div>

        <div className={styles.heroBody}>
          <h1 className={styles.title}>{data.display_name || "Requester"}</h1>
          {data.public_location ? <p className={styles.subtitle}>{data.public_location}</p> : null}

          <div className={styles.badges}>
            <span className={styles.badge}>Email {data.verification.email_verified ? "verified" : "unverified"}</span>
            <span className={styles.badge}>Phone {data.verification.phone_verified ? "verified" : "unverified"}</span>
            <span className={styles.badge}>{idCheckLabel(data.verification.id_verification_status)}</span>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>About</h2>
          {data.bio ? <p className={styles.body}>{data.bio}</p> : <p className={styles.bodyMuted}>No bio yet.</p>}

          <div className={styles.list}>
            <div>
              <span className={styles.listLabel}>Languages</span>
              <span className={styles.listValue}>{data.languages.length ? data.languages.join(", ") : "—"}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Interaction tags</span>
              <span className={styles.listValue}>{data.interaction_tags.length ? data.interaction_tags.join(", ") : "—"}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Availability windows</span>
              <span className={styles.listValue}>{data.availability_windows.length ? data.availability_windows.join(", ") : "—"}</span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>What I usually need help with</h2>
          <div className={styles.list}>
            <div>
              <span className={styles.listLabel}>Need categories</span>
              <span className={styles.listValue}>{data.need_categories.length ? data.need_categories.join(", ") : "—"}</span>
            </div>
          </div>
          {data.need_help_prompt ? <p className={styles.body}>{data.need_help_prompt}</p> : null}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Logistics & household</h2>
          <div className={styles.list}>
            <div>
              <span className={styles.listLabel}>Parking available</span>
              <span className={styles.listValue}>{boolLabel(data.logistics.parking_available)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Elevator available</span>
              <span className={styles.listValue}>{boolLabel(data.logistics.elevator_available)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Stairs present</span>
              <span className={styles.listValue}>{boolLabel(data.logistics.stairs_present)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Pickup vs dropoff</span>
              <span className={styles.listValue}>{data.logistics.pickup_vs_dropoff || "—"}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Time flexibility</span>
              <span className={styles.listValue}>{data.logistics.time_flexibility || "—"}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Pets at home</span>
              <span className={styles.listValue}>{boolLabel(data.household.pets_at_home)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Smoke-free</span>
              <span className={styles.listValue}>{boolLabel(data.household.smoke_free)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Accessibility needs</span>
              <span className={styles.listValue}>{data.household.accessibility_needs || "—"}</span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Safety preferences</h2>
          <div className={styles.list}>
            <div>
              <span className={styles.listLabel}>Meet in public first</span>
              <span className={styles.listValue}>{boolLabel(data.safety_preferences.meet_in_public_first)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Someone else present</span>
              <span className={styles.listValue}>{boolLabel(data.safety_preferences.someone_else_present)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Mask preferred</span>
              <span className={styles.listValue}>{boolLabel(data.safety_preferences.mask_preferred)}</span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Trust signals</h2>
          <div className={styles.list}>
            <div>
              <span className={styles.listLabel}>Completed help</span>
              <span className={styles.listValue}>{data.stats.completed_commitments_count}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Cancellation rate</span>
              <span className={styles.listValue}>{formatPercent(data.stats.cancellation_rate)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Typical response time</span>
              <span className={styles.listValue}>{replyTimeLabel(data.stats.typical_response_time_seconds)}</span>
            </div>
            <div>
              <span className={styles.listLabel}>Thank-you notes</span>
              <span className={styles.listValue}>{data.stats.thank_you_notes_count}</span>
            </div>
          </div>
        </section>

        <section className={`${styles.card} mt-3.5`}>
          <h2 className={styles.cardTitle}>Reviews (as requester)</h2>
          <p className={styles.meta}>
            <Stars rating={avgRating} /> {avgRating.toFixed(1)} · {reviewCount} total
          </p>

          {reviewCount === 0 ? (
            <p className={`${styles.meta} mt-2.5`}>
              No reviews yet.
            </p>
          ) : (
            <div className="mt-3">
              {recent.map((r) => (
                <div key={r.id} className={`${styles.tile} mt-2.5`}>
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
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
