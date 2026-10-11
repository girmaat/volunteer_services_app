import styles from "./page.module.css";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const dynamic = "force-dynamic";

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
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/terms`, { cache: "no-store" });
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
        <h1 className={styles.title}>{page?.title ?? "Terms of Service"}</h1>
        <p className={styles.subtitle}>Terms of service loaded from backend.</p>
        {error && (<p className={styles.subtitle}>Content unavailable: {error}</p>)}
        <span className={styles.badge}>Public</span>
      </header>
      <div className={styles.content}>
        {page?.body ?? "These terms are provided for demo/training purposes. Replace with your organization\u2019s official terms before production use."}
      </div>
    </section>
  );
}
