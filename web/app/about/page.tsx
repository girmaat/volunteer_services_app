import styles from "./page.module.css";
import { API_BASE_URL_SERVER } from "@helpers/shared-config";
import PublicPageBody from "../_components/PublicPageBody";

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

const DEFAULT_ABOUT_BODY = `## Our mission
GiveBack connects volunteers, neighbors, and organizations so help reaches the right place—quickly and safely.

We’re designed for real-world coordination: clear expectations, simple communication, and follow‑through you can measure.

## Who it’s for
- Volunteers looking for flexible ways to contribute
- Neighbors requesting support with everyday needs
- Organizations coordinating volunteers and opportunities
- Administrators supporting trust & safety and policy enforcement

## What you can do on GiveBack
- Browse opportunities and service requests (sign in to view full details)
- Apply, message, and confirm logistics in one place
- Track volunteer hours and outcomes over time
- Leave reviews after completion to build trust and reputation
- Share impact stories (optional) to celebrate results

## Trust, safety, and privacy
GiveBack includes blocking, reporting, and privacy controls. You decide whether your public profile is visible and who can message you. If something doesn’t look right, use “Report” from any profile.

## Built for training and real-world use
This environment may include demo content for training and smoke testing. Before production use, review your organization’s policies and update public pages (Terms/Privacy) to match your requirements.`;


async function getPage(): Promise<PageLoad> {
  try {
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/about`, { cache: "no-store" });
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
        <h1 className={styles.title}>{page?.title ?? "About GiveBack"}</h1>
        <p className={styles.subtitle}>Mission and story content loaded from backend.</p>
        {error && (<p className={styles.subtitle}>Content unavailable: {error}</p>)}
        <span className={styles.badge}>Public</span>
      </header>
      <div className={styles.content}>
        <PublicPageBody body={page?.body ?? DEFAULT_ABOUT_BODY} />
      </div>
    </section>
  );
}
