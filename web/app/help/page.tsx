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

const DEFAULT_HELP_BODY = `## Quick start
1) Create an account and verify your email.
2) Complete onboarding to set your role and preferences.
3) Browse Opportunities or Organizations, then apply or reach out.
4) Use Messages to confirm timing, location, and expectations.
5) After completion, log hours and leave a review.

## Account & access
### I can’t sign in or I didn’t get a verification email
- Check spam/junk folders.
- Confirm you’re using the correct email address.
- Try requesting a new sign‑in / verification link.

### Why can’t I see opportunities or organizations?
For privacy, full directories are available to logged‑in users only. Sign in to browse and view details.

## Privacy & safety
### Where do I update privacy and messaging settings?
Go to Settings → Privacy & Safety to control public profile visibility and who can message you.

### How do I block or report someone?
Open the user’s profile and choose Block or Report. You can review “Reports I’ve Filed” from Settings.

## Volunteering workflow
- Applying: open an opportunity or request and submit an application.
- Confirming: message to agree on details, then confirm the engagement in the app.
- Completing: once the work is done, mark the engagement complete and log hours/outcomes.
- Reviews: after completion, leave a review to help build trust for future matches.

## Troubleshooting
- “Something went wrong”: refresh the page, confirm the backend is running, and ensure schema ensure/migrations are enabled for local development.
- If you’re running locally and public pages won’t load, verify RUN_MIGRATIONS=true and restart the backend.

## Need more help?
Use the Contact page or reach your organization administrator. For urgent safety issues or immediate danger, contact local emergency services.`;


async function getPage(): Promise<PageLoad> {
  try {
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/help`, { cache: "no-store" });
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
        <h1 className={styles.title}>{page?.title ?? "Help & Support"}</h1>
        <p className={styles.subtitle}>Frequently asked questions loaded from backend.</p>
        {error && (<p className={styles.subtitle}>Content unavailable: {error}</p>)}
        <span className={styles.badge}>Public</span>
      </header>
      <div className={styles.content}>
        <PublicPageBody body={page?.body ?? DEFAULT_HELP_BODY} />
      </div>
    </section>
  );
}
