import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import { getOrgContext } from "../../../lib/org";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function createAction(formData: FormData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");

  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const neededByRaw = String(formData.get("needed_by") || "").trim();
  let needed_by: string | null = null;
  if (neededByRaw) {
    const d = new Date(neededByRaw);
    if (!Number.isNaN(d.getTime())) needed_by = d.toISOString();
  }

  const modeRaw = String(formData.get("mode") || "").trim();
  const mode = modeRaw ? modeRaw : null;

  const payload = {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    location_text: String(formData.get("location_text") || "").trim() || null,
    mode,
    needed_by
  };

  const res = await backendFetch("/v1/org/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let msg = "Create failed";
    try {
      const data = (await res.json()) as any;
      if (data?.error) msg = String(data.error);
    } catch {
      try {
        const t = await res.text();
        if (t) msg = t;
      } catch {}
    }
    redirect(`/org/requests/new?error=${encodeURIComponent(msg)}`);
  }

  const created = (await res.json()) as any;
  redirect(`/org/requests/${created.id}`);
}

export default async function Page(props: { searchParams?: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");

  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>Create request</h2>
          <p className={styles.subtitle}>Post a new request on behalf of your organization.</p>
        </div>

        {searchParams?.error ? (
          <div className={styles.error} role="alert" aria-live="polite">
            {searchParams.error}
          </div>
        ) : null}

        <form action={createAction} className={styles.form}>
          <div className={styles.field}>
            <div className={styles.label}>Title</div>
            <input className={styles.input} name="title" required minLength={2} placeholder="Short summary" />
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Description</div>
            <textarea
              className={styles.textarea}
              name="description"
              required
              minLength={10}
              rows={6}
              placeholder="Describe what help is needed, when, and any important details."
            />
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Location (optional)</div>
            <input className={styles.input} name="location_text" placeholder="City, State" />
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Mode (optional)</div>
            <select className={styles.select} name="mode" defaultValue="">
              <option value="">Select…</option>
              <option value="in-person">In-person</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          <div className={styles.field}>
            <div className={styles.label}>Needed by (optional)</div>
            <input className={styles.input} type="datetime-local" name="needed_by" />
          </div>

          <div className={styles.actions}>
            <button className={styles.primaryButton} type="submit">
              Create
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

