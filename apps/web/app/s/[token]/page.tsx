import { redirect } from "next/navigation";
import { backendFetch } from "../../lib/backend";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const token = String(params.token || "");
  const res = await backendFetch(`/v1/share/resolve/${encodeURIComponent(token)}`, { method: "GET" });

  if (res.status === 401 || res.status === 403) {
    return (
      <section className={styles.page}>
        <h1 className={styles.title}>Sign in required</h1>
        <p className={styles.body}>Please sign in to open this shared link.</p>
        <p className={styles.body}>
          <a className={styles.link} href={`/login?returnTo=${encodeURIComponent("/s/" + token)}`}>Log in</a>
        </p>
      </section>
    );
  }

  if (!res.ok) {
    return (
      <section className={styles.page}>
        <h1 className={styles.title}>Link unavailable</h1>
        <p className={styles.body}>This link may have expired or been revoked.</p>
      </section>
    );
  }

  const body = (await res.json()) as any;
  const dest = String(body?.destination_path || "/");
  redirect(dest);
}