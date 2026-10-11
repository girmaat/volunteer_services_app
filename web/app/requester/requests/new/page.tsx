import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "../../requester.module.css";
import { backendFetch, getCurrentUser } from "../../../lib/backend";

export const dynamic = "force-dynamic";

async function createRequestAction(formData: FormData) {
  "use server";

  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const mode = String(formData.get("mode") || "").trim() || null;
  const locationText = String(formData.get("locationText") || "").trim() || null;
  const neededBy = String(formData.get("neededBy") || "").trim() || null;
  const tags = String(formData.get("tags") || "").trim() || null;

  const payload = {
    title,
    description,
    mode,
    locationText,
    neededBy,
    tags
  };

  const res = await backendFetch("/v1/requester/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = encodeURIComponent(String((err as any)?.message || "Create failed"));
    redirect(`/requester/requests/new?error=${msg}`);
  }

  const created = (await res.json().catch(() => null)) as any;
  const id = String(created?.id || "");
  if (!id) {
    redirect(`/requester/requests/new?error=${encodeURIComponent("Create failed (missing id)")}`);
  }

  redirect(`/requester/requests/${id}?created=1`);
}

export default async function Page({ searchParams }: { searchParams?: { error?: string } }) {
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : "";
  const user = await getCurrentUser();

  return (
    <>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>New request</h2>
          <p className={styles.meta}>Create a request that volunteers can discover and apply to.</p>
          <p className={styles.meta}>
            Signed in as <strong>{user?.email}</strong>.
          </p>
        </div>

        <Link className={styles.navLink} href="/requester/requests">
          Back to requests
        </Link>
      </div>

      {error ? (
        <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
          <p className={styles.bannerTitle}>Couldn’t create request</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : null}

      <form className={styles.form} action={createRequestAction}>
        <label className={styles.small}>
          Title (required)
          <input className={styles.input} name="title" required maxLength={200} />
        </label>

        <label className={styles.small}>
          Description (required)
          <textarea className={styles.textarea} name="description" required />
        </label>

        <label className={styles.small}>
          Mode
          <select className={styles.select} name="mode" defaultValue="remote">
            <option value="remote">Remote</option>
            <option value="in-person">In-person</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>

        <label className={styles.small}>
          Location (optional)
          <input className={styles.input} name="locationText" placeholder="e.g., Brooklyn, NY" maxLength={200} />
        </label>

        <label className={styles.small}>
          Needed by (optional)
          <input className={styles.input} name="neededBy" type="date" />
        </label>

        <label className={styles.small}>
          Tags (optional, comma-separated)
          <input className={styles.input} name="tags" placeholder="e.g., childcare, errands, translation" />
        </label>

        <div className={styles.actionsRow}>
          <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
            Create request
          </button>
          <Link className={styles.button} href="/requester/requests">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
