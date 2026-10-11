import styles from "./page.module.css";
import { API_BASE_URL_SERVER } from "@thankyou/config";

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
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/trust-safety`, { next: { revalidate: 300 } });
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
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : "fetch failed";
    return { page: null, error: msg };
  }
}


export default async function Page() {
  const { page, error } = await getPage();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{page?.title ?? "Trust & Safety"}</h1>
        <p className={styles.subtitle}>Safety, verification, and reporting policies.</p>
        <span className={styles.badge}>Public</span>
      </header>
      <div className={styles.content}>
        {page?.body ?? "We encourage respectful communication, accurate profiles, and transparent expectations. Use blocking and reporting tools if you experience harassment, spam, or unsafe behavior."}
      </div>
    </section>
  );
}
