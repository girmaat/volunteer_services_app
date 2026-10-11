
import styles from "./page.module.css";
import Link from "next/link";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const metadata = { title: "Impact stories" };

export const revalidate = 300;

type Story = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  updated_at: string;
};

type StoriesResult = {
  stories: Story[];
  error?: string;
};

async function getStories(): Promise<StoriesResult> {
  try {
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/stories`, { next: { revalidate: 300 } });

    if (!res.ok) {
      // Try to read a useful server message, but never crash the page.
      let msg = `Failed to load stories (HTTP ${res.status})`;
      try {
        const body = (await res.json()) as any;
        if (body?.message) msg = String(body.message);
      } catch {
        // ignore
      }
      return { stories: [], error: msg };
    }

    const stories = (await res.json()) as Story[];
    return { stories };
  } catch (e: any) {
    return { stories: [], error: e?.message || "Failed to load stories" };
  }
}

export default async function Page() {
  const { stories, error } = await getStories();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Impact Stories</h1>
        <p className={styles.subtitle}>Real moments of help, captured as stories.</p>
        {error ? (
          <p className={styles.subtitle}>
            {error}. If you’re running locally, make sure the backend is up and healthy.
          </p>
        ) : null}
      </header>

      {stories.length === 0 ? (
        <p className={styles.subtitle}>No stories yet.</p>
      ) : (
        <div className={styles.grid}>
          {stories.map((s) => (
            <article key={s.id} className={styles.card}>
              <h3 className={styles.cardTitle}>
                <Link href={`/impact-stories/${s.slug}`}>{s.title}</Link>
              </h3>
              <div className={styles.meta}>
                Updated {new Date(s.updated_at).toLocaleDateString()}
              </div>
              <p className={styles.cardBody}>{s.excerpt}</p>
              <p className={styles.cardBody}>
                <Link href={`/impact-stories/${s.slug}`}>Read story →</Link>
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

