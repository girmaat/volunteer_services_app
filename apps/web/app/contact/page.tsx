import { forwardHeaders } from "../../lib/forward";
import styles from "./page.module.css";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const metadata = { title: "Contact us", alternates: { canonical: "/contact" } };

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
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/pages/contact`, { next: { revalidate: 300 } });
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


async function submitContact(formData: FormData) {
  "use server";
  const payload = {
    name: String(formData.get("name") || ""),
    email: String(formData.get("email") || ""),
    message: String(formData.get("message") || "")
  };

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/contact`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Contact submit failed");
  }
}

export default async function Page() {
  const { page, error } = await getPage();

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{page?.title ?? "Contact"}</h1>
        <p className={styles.subtitle}>Contact form wired to backend validation.</p>
        <span className={styles.badge}>Public</span>
      </header>

      <div className={styles.content}>
        <p className={styles.cardBody}>{page?.body ?? "Questions or feedback? Use the in-app help tools or reach your administrators. For urgent safety issues, contact local emergency services."}</p>

        <form className={styles.form} action={submitContact}>
          <label>
            <div className={styles.meta}>Your name</div>
            <input className={styles.input} name="name" placeholder="Name" required />
          </label>

          <label>
            <div className={styles.meta}>Your email</div>
            <input className={styles.input} name="email" type="email" placeholder="Email" required />
          </label>

          <label>
            <div className={styles.meta}>Message</div>
            <textarea className={styles.textarea} name="message" placeholder="How can we help?" required />
          </label>

          <div className={styles.buttonRow}>
            <button className={styles.button} type="submit">Send</button>
            <span className={styles.meta}>This is a placeholder workflow; backend validates input and returns 202.</span>
          </div>
        </form>
      </div>
    </section>
  );
}
