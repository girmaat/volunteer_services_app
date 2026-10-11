import styles from "./page.module.css";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const metadata = { title: "Code of conduct" };

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
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/code-of-conduct`, { next: { revalidate: 300 } });
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
        <h1 className={styles.title}>{page?.title ?? "Code of Conduct"}</h1>
        <p className={styles.subtitle}>Community rules and expectations.</p>
        <span className={styles.badge}>Public</span>
      </header>
      <div className={styles.content}>
        {page?.body ?? "Be kind, be honest, and respect boundaries. Discrimination, harassment, and fraud are not tolerated. Repeated violations may lead to account enforcement."}
      </div>
      <section aria-labelledby="reliability-policy" className="mt-10 grid max-w-[70ch] gap-3">
        <h2 id="reliability-policy" className="m-0 text-xl">
          Reliability, cancellations and reviews
        </h2>
        <p className="m-0">
          People plan around your commitment. If you can&apos;t make it, cancel in the app as early as you can — the next person on the
          waitlist is moved up automatically.
        </p>
        <ul className="m-0 grid gap-2 pl-5">
          <li>
            <strong>Late cancellation:</strong> canceling less than 24 hours before the start. It&apos;s recorded on your profile as part of a
            reliability stat (for example &ldquo;12 completed · 1 late cancel&rdquo;), not as a star rating.
          </li>
          <li>
            <strong>No-show:</strong> not turning up without canceling. Organizers can record a no-show only after the start time.
          </li>
          <li>
            <strong>Reviews</strong> are double-blind: neither side sees the other&apos;s review until both are in, or 14 days after the work is
            completed. Published reviews can&apos;t be edited.
          </li>
          <li>
            <strong>Disputes:</strong> if a no-show, late cancellation or review is wrong, open a dispute from the application. A moderator reviews
            it and can remove the record; every decision is logged.
          </li>
          <li>
            Repeated late cancellations or no-shows may limit your access to sensitive categories or lead to enforcement under these rules.
          </li>
        </ul>
        <p className="m-0">
          For everyone&apos;s safety, keep coordination in ThankYou messages. Contact details are shared only after an application is accepted, and
          we never ask you to send money, gift cards, passwords or codes.
        </p>
      </section>
    </section>
  );
}
