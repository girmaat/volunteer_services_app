import styles from "./page.module.css";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const metadata = { title: "How it works", alternates: { canonical: "/how-it-works" } };

export const revalidate = 300;

type PublicPage = {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
};

type PageLoad = {
  page: PublicPage | null;
  error: string | null;
};

async function getPage(): Promise<PageLoad> {
  try {
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/how-it-works`, { next: { revalidate: 300 } });
    if (!res.ok) {
      let msg = `Failed to load page (HTTP ${res.status})`;
      try {
        const data = await res.json();
        if (data?.message) msg = String(data.message);
      } catch {
        // ignore
      }
      return { page: null, error: msg };
    }
    return { page: await res.json(), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    return { page: null, error: msg };
  }
}


export default async function Page() {
  const { page, error } = await getPage();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{page?.title ?? "How it works"}</h1>
        <p className={styles.subtitle}>Explains the core flow in simple steps.</p>
        <span className={styles.badge}>Public</span>
      </header>
      <div className={styles.content}>
        {page?.body ?? "1) Browse opportunities or requests. 2) Apply or offer help. 3) Message to confirm details. 4) Complete the work and log hours. 5) Leave a review and share outcomes."}
      </div>
    </section>
  );
}
