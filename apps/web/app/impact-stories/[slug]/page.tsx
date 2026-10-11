import styles from "./page.module.css";
import Link from "next/link";
import ShareButton from "../../_components/share/ShareButton";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const revalidate = 300;

type StoryDetail = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_image_url: string | null;
  updated_at: string;
};

async function getStory(
  slug: string
): Promise<{ story: StoryDetail | null; error: string | null }> {
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/stories/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
  if (!res.ok) {
    let msg = `Failed to load story (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as any;
      if (body?.message) msg = String(body.message);
      if (body?.error === "backend_fetch_failed" && body?.message) msg = String(body.message);
    } catch {
      // ignore
    }
    return { story: null, error: msg };
  }
  const story = (await res.json()) as StoryDetail;
  return { story, error: null };
}

function renderBody(body: string) {
  const normalized = String(body || "").trim();
  if (!normalized) return <p className={styles.body}>No story content yet.</p>;

  const blocks = normalized
    .split(/\n{2,}/g)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((b, idx) => (
    <p key={idx} className={styles.body}>
      {b}
    </p>
  ));
}

export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const { story, error } = await getStory(params.slug);

  if (error) {
    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <p className={styles.breadcrumb}>
            <Link href="/impact-stories">← Back to Impact Stories</Link>
          </p>
          <h1 className={styles.title}>Impact Story</h1>
          <p className={styles.meta}>{error}</p>
        </header>
      </section>
    );
  }

  if (!story) {
    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <p className={styles.breadcrumb}>
            <Link href="/impact-stories">← Back to Impact Stories</Link>
          </p>
          <h1 className={styles.title}>Story not found</h1>
          <p className={styles.meta}>This story may have been removed or is unavailable.</p>
        </header>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <p className={styles.breadcrumb}>
          <Link href="/impact-stories">← Back to Impact Stories</Link>
        </p>

        <div className={styles.titleRow}>
          <h1 className={styles.title}>{story.title}</h1>
          <ShareButton target={{ type: "impact", ref: story.slug, title: story.title }} />
        </div>
        <p className={styles.meta}>Updated {new Date(story.updated_at).toLocaleDateString()}</p>
      </header>

      <div className={styles.content}>
        {story.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.cover} src={story.cover_image_url} alt="" />
        ) : null}

        {renderBody(story.body || story.excerpt)}
      </div>
    </section>
  );
}



