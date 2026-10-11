import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../../../requester.module.css";
import { backendFetch } from "../../../../lib/backend";

export const dynamic = "force-dynamic";

type RequestDetail = {
  id: string;
  requester_user_id: string;
  title: string;
  description: string;
  status: "open" | "paused" | "closed" | string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string;
  needed_by: string | null;
  tags: string[] | null;
  requester_org_slug: string | null;
  created_at: string;
  updated_at: string;
};

async function loadRequest(id: string): Promise<RequestDetail> {
  const res = await backendFetch(`/v1/requester/requests/${id}`, { method: "GET" });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load request");

  return res.json();
}

export default async function Page({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const id = params.id;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) notFound();

  const request = await loadRequest(id);
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  async function updateRequestAction(formData: FormData) {
    "use server";

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const status = String(formData.get("status") || "").trim();
    const mode = String(formData.get("mode") || "").trim() || null;
    const locationText = String(formData.get("locationText") || "").trim() || null;
    const neededBy = String(formData.get("neededBy") || "").trim() || null;
    const tags = String(formData.get("tags") || "").trim() || null;

    const payload = {
      title,
      description,
      status,
      mode,
      locationText,
      neededBy,
      tags
    };

    const res = await backendFetch(`/v1/requester/requests/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Update failed"));
      redirect(`/requester/requests/${id}/edit?error=${msg}`);
    }

    revalidatePath(`/requester/requests/${id}`);
    revalidatePath(`/requester/requests`);
    redirect(`/requester/requests/${id}?updated=1`);
  }

  const neededByValue = request.needed_by ? String(request.needed_by).slice(0, 10) : "";
  const tagsValue = request.tags?.length ? request.tags.join(", ") : "";

  return (
    <>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>Edit request</h2>
          <p className={styles.meta}>Update fields and save to refresh the request detail view.</p>
        </div>
        <Link className={styles.navLink} href={`/requester/requests/${id}`}>
          Back to request
        </Link>
      </div>

      {error ? (
        <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
          <p className={styles.bannerTitle}>Couldn’t save changes</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : null}

      <form className={styles.form} action={updateRequestAction}>
        <label className={styles.small}>
          Title (required)
          <input className={styles.input} name="title" required maxLength={200} defaultValue={request.title} />
        </label>

        <label className={styles.small}>
          Description (required)
          <textarea className={styles.textarea} name="description" required defaultValue={request.description} />
        </label>

        <label className={styles.small}>
          Status
          <select className={styles.select} name="status" defaultValue={request.status || "open"}>
            <option value="open">Open</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </label>

        <label className={styles.small}>
          Mode
          <select className={styles.select} name="mode" defaultValue={request.mode || "remote"}>
            <option value="remote">Remote</option>
            <option value="in-person">In-person</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>

        <label className={styles.small}>
          Location (optional)
          <input className={styles.input} name="locationText" placeholder="e.g., Brooklyn, NY" maxLength={200} defaultValue={request.location || ""} />
        </label>

        <label className={styles.small}>
          Needed by (optional)
          <input className={styles.input} name="neededBy" type="date" defaultValue={neededByValue} />
        </label>

        <label className={styles.small}>
          Tags (optional, comma-separated)
          <input className={styles.input} name="tags" placeholder="e.g., childcare, errands, translation" defaultValue={tagsValue} />
        </label>

        <div className={styles.actionsRow}>
          <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
            Save changes
          </button>
          <Link className={styles.button} href={`/requester/requests/${id}`}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
