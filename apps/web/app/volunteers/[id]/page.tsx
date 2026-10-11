import Link from "next/link";
import { notFound } from "next/navigation";
import { backendFetch } from "../../lib/backend";
import styles from "../public.module.css";

export const dynamic = "force-dynamic";

function initialsFrom(name: string | null) {
  const raw = (name || "").trim();
  if (!raw) return "?";
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  const out = (first + second).toUpperCase();
  return out || "?";
}

function formatHours(v: number) {
  if (!isFinite(v)) return "0";
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const res = await backendFetch(`/v1/public/volunteers/${params.id}`, { method: "GET" });
  if (res.status === 404) return notFound();
  if (!res.ok) return notFound();

  const v = (await res.json()) as any;

  const name = (v?.display_name as string | null) || (v?.full_name as string | null) || "Volunteer";
  const location = (v?.public_location as string | null) || (v?.location as string | null) || null;
  const bio = (v?.bio as string | null) || null;

  const stats = v?.stats || {};
  const completed = Number(stats.completed_count || 0);
  const hours = Number(stats.total_hours || 0);
  const avg = Number(stats.average_rating || 0);
  const reviewCount = Number(stats.reviews_count || 0);

  const avatarText = initialsFrom(name);

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.avatar} aria-hidden="true">
            <span className={styles.avatarText}>{avatarText}</span>
          </div>

          <div>
            <h1 className={styles.title}>{name}</h1>
            <p className={styles.meta}>
              {location ? <span>{location}</span> : <span>Location not shared</span>}
            </p>
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.tile}>
            <p className={styles.tileLabel}>Completed opportunities</p>
            <p className={styles.tileValue}>{completed}</p>
          </div>

          <div className={styles.tile}>
            <p className={styles.tileLabel}>Total hours logged</p>
            <p className={styles.tileValue}>{formatHours(hours)}</p>
          </div>

          <div className={styles.tile}>
            <p className={styles.tileLabel}>Average rating</p>
            <p className={styles.tileValue}>{avg ? (Math.round(avg * 10) / 10).toFixed(1) : "—"}</p>
          </div>

          <div className={styles.tile}>
            <p className={styles.tileLabel}>Reviews received</p>
            <p className={styles.tileValue}>{reviewCount}</p>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>About</h2>
        <p className={styles.body}>{bio || "This volunteer hasn’t added a bio yet."}</p>

        <div className={styles.actions}>
          <Link prefetch={false} className={styles.button} href="/opportunities">
            Browse opportunities
          </Link>
        </div>
      </div>
    </section>
  );
}


