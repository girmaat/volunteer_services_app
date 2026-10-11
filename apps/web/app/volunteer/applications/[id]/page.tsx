import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../../volunteer.module.css";
import { backendFetch } from "../../../lib/backend";
import ShareButton from "../../../_components/share/ShareButton";

export const dynamic = "force-dynamic";

type ApplicationCommitment = {
  id: string;
  status: string;
  start_at: string;
  end_at: string | null;
};

type RequesterReview = {
  id: string;
  rating: number;
  strengths: string | null;
  improvements: string | null;
  would_work_again: boolean | null;
  created_at: string;
};

type ApplicationDetail = {
  id: string;
  opportunity_id: string;
  status: string;
  message: string | null;
  created_at: string;
  updated_at: string;
  requester_user_id: string | null;
  commitment: ApplicationCommitment | null;
  opportunity: {
    id: string;
    title: string;
    location: string;
    mode: "in-person" | "remote" | "hybrid";
    organization_name: string | null;
    tags: string[] | null;
  };
};

async function getApplication(id: string): Promise<ApplicationDetail | null> {
  const res = await backendFetch(`/v1/volunteer/applications/${id}`, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error("Failed to load application");
  }
  return (await res.json()) as ApplicationDetail;
}

async function getRequesterReview(id: string): Promise<RequesterReview | null> {
  const res = await backendFetch(`/v1/volunteer/applications/${id}/review-requester`, { method: "GET" });
  if (!res.ok) return null;
  const json = (await res.json()) as { review: RequesterReview | null };
  return json.review || null;
}

function toDateTimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function withdrawApplication(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  if (!id) return;

  const res = await backendFetch(`/v1/volunteer/applications/${id}/withdraw`, { method: "POST" });
  if (!res.ok) {
    redirect(`/volunteer/applications/${id}?success=0&action=withdraw`);
  }

  revalidatePath(`/volunteer/applications/${id}`);
  redirect(`/volunteer/applications/${id}?success=1&action=withdraw`);
}

async function scheduleCommitment(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const startLocal = String(formData.get("start_at") || "");
  const endLocal = String(formData.get("end_at") || "");

  if (!id || !startLocal) return;

  const payload: any = {
    start_at: new Date(startLocal).toISOString(),
  };
  if (endLocal) payload.end_at = new Date(endLocal).toISOString();

  const res = await backendFetch(`/v1/volunteer/applications/${id}/schedule`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    redirect(`/volunteer/applications/${id}?success=0&action=schedule`);
  }

  revalidatePath(`/volunteer/applications/${id}`);
  redirect(`/volunteer/applications/${id}?success=1&action=schedule`);
}

async function markCompleted(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  if (!id) return;

  const res = await backendFetch(`/v1/volunteer/applications/${id}/complete`, { method: "POST" });
  if (!res.ok) {
    redirect(`/volunteer/applications/${id}?success=0&action=complete`);
  }

  revalidatePath(`/volunteer/applications/${id}`);
  redirect(`/volunteer/applications/${id}?success=1&action=complete`);
}

async function leaveRequesterReview(formData: FormData) {
  "use server";
  const id = String(formData.get("id") || "");
  const rating = Number(formData.get("rating") || 0);
  const strengths = String(formData.get("strengths") || "").trim();
  const improvements = String(formData.get("improvements") || "").trim();
  const wouldWorkAgain = String(formData.get("would_work_again") || "") === "on";

  if (!id || !rating) {
    redirect(`/volunteer/applications/${id}?success=0&action=review_requester`);
  }

  const res = await backendFetch(`/v1/volunteer/applications/${id}/review-requester`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rating,
      strengths: strengths || undefined,
      improvements: improvements || undefined,
      would_work_again: wouldWorkAgain
    })
  });

  if (!res.ok) {
    redirect(`/volunteer/applications/${id}?success=0&action=review_requester`);
  }

  revalidatePath(`/volunteer/applications/${id}`);
  redirect(`/volunteer/applications/${id}?success=1&action=review_requester`);
}

function statusTimeline(status: string) {
  const base = [
    { key: "pending", label: "Applied" },
    { key: "waitlisted", label: "Waitlisted" },
    { key: "accepted", label: "Accepted" },
    { key: "confirmed", label: "Scheduled" },
    { key: "completed", label: "Completed" },
  ];

  if (status === "rejected") {
    return [
      { key: "pending", label: "Applied", state: "done" as const },
      { key: "rejected", label: "Rejected", state: "current" as const },
    ];
  }

  if (status === "withdrawn") {
    return [
      { key: "pending", label: "Applied", state: "done" as const },
      { key: "withdrawn", label: "Withdrawn", state: "current" as const },
    ];
  }

  if (status === "canceled") {
    return [
      { key: "pending", label: "Applied", state: "done" as const },
      { key: "canceled", label: "Canceled", state: "current" as const },
    ];
  }

  const idx = base.findIndex((s) => s.key === status);
  return base.map((s, i) => {
    if (idx === -1) return { ...s, state: "future" as const };
    if (i < idx) return { ...s, state: "done" as const };
    if (i === idx) return { ...s, state: "current" as const };
    return { ...s, state: "future" as const };
  });
}

export default async function VolunteerApplicationDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ success?: string; action?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const app = await getApplication(params.id);
  const existingRequesterReview = app && app.status === "completed" ? await getRequesterReview(app.id) : null;
  if (!app) return notFound();

  const timeline = statusTimeline(app.status);
  const bannerSuccess = searchParams?.success === "1";
  const bannerAction = searchParams?.action || "";

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.sectionTitle}>Application</h2>
          <p className={styles.meta}>
            Status: <span className={styles.statusPill}>{app.status}</span> · Submitted:{" "}
            {new Date(app.created_at).toLocaleString()} · Updated: {new Date(app.updated_at).toLocaleString()}
          </p>
        </div>

        <div className={styles.actionsRow}>
          {app.requester_user_id ? (
            <Link className={styles.navLink} href={`/volunteer/messages/${app.requester_user_id}?requestId=${app.opportunity_id}&applicationId=${app.id}`}>
              Open messages
            </Link>
          ) : null}
          <Link className={styles.navLink} href={`/volunteer/opportunities/${app.opportunity_id}`}>
            Back to opportunity
          </Link>
        </div>
      </div>

      {searchParams?.action ? (
        <div className={`${styles.banner} ${bannerSuccess ? styles.bannerSuccess : styles.bannerError}`}>
          {bannerSuccess ? (
            <p className={styles.bannerBody}>Updated ({bannerAction}).</p>
          ) : (
            <p className={styles.bannerBody}>Could not update ({bannerAction}). Please try again.</p>
          )}
        </div>
      ) : null}

      <div className={styles.banner}>
        <p className={styles.bannerTitle}>{app.opportunity.title}</p>
        <p className={styles.bannerBody}>
          {app.opportunity.organization_name ? `${app.opportunity.organization_name} · ` : ""}
          {app.opportunity.mode} · {app.opportunity.location}
        </p>
      </div>

      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>Status timeline</h3>
        <ol className={styles.timeline}>
          {timeline.map((s) => (
            <li key={s.key} className={styles[`timeline_${s.state}` as any]}>
              <span className={styles.timelineDot} />
              <span className={styles.timelineLabel}>{s.label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.sectionCard}>
        <h3 className={styles.sectionTitle}>Actions</h3>

        {app.status === "pending" ? (
          <form action={withdrawApplication} className={styles.inlineForm}>
            <input type="hidden" name="id" value={app.id} />
            <button className={`${styles.button} ${styles.buttonDanger}`} type="submit">
              Withdraw application
            </button>
          </form>
        ) : null}

        {app.status === "accepted" || app.status === "confirmed" ? (
          <div className={styles.stack}>
            <p className={styles.meta}>
              {app.commitment
                ? `Current commitment: ${new Date(app.commitment.start_at).toLocaleString()}${
                    app.commitment.end_at ? ` – ${new Date(app.commitment.end_at).toLocaleString()}` : ""
                  } (${app.commitment.status})`
                : "Schedule your commitment time so it appears on your calendar."}
            </p>

            <form action={scheduleCommitment} className={styles.formGrid}>
              <input type="hidden" name="id" value={app.id} />
              <label className={styles.field}>
                <span className={styles.meta}>Start</span>
                <input
                  className={styles.input}
                  type="datetime-local"
                  name="start_at"
                  required
                  defaultValue={app.commitment?.start_at ? toDateTimeLocalValue(app.commitment.start_at) : undefined}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.meta}>End</span>
                <input
                  className={styles.input}
                  type="datetime-local"
                  name="end_at"
                  defaultValue={app.commitment?.end_at ? toDateTimeLocalValue(app.commitment.end_at) : undefined}
                />
              </label>
              <div className={styles.actionsRow}>
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                  Save schedule
                </button>
              </div>
            </form>

            {app.status === "confirmed" ? (
              <form action={markCompleted} className={styles.inlineForm}>
                <input type="hidden" name="id" value={app.id} />
                <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                  Mark completed
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        {app.status === "completed" ? <p className={styles.meta}>This application is completed.</p> : null}
        {app.status === "rejected" ? <p className={styles.meta}>This application was rejected.</p> : null}
        {app.status === "withdrawn" ? <p className={styles.meta}>You withdrew this application.</p> : null}
      </div>

            {app.status === "completed" ? (
        <div className={styles.sectionCard}>
          <h3 className={styles.sectionTitle}>Review this requester</h3>
          <p className={styles.meta} style={{ marginTop: "0.35rem" } as any}>
            Your feedback helps build trust for future volunteers.
          </p>

          <form action={leaveRequesterReview} className={styles.inlineForm} style={{ marginTop: "0.75rem" } as any}>
            <input type="hidden" name="id" value={app.id} />
            <label className={styles.label}>
              Rating
              <select name="rating" defaultValue={existingRequesterReview?.rating ?? 5} className={styles.input}>
                <option value={5}>5</option>
                <option value={4}>4</option>
                <option value={3}>3</option>
                <option value={2}>2</option>
                <option value={1}>1</option>
              </select>
            </label>

            <label className={styles.label}>
              What went well
              <textarea
                name="strengths"
                defaultValue={existingRequesterReview?.strengths ?? ""}
                className={styles.textarea}
                rows={3}
                placeholder="Clear communication, prepared materials, flexible scheduling…"
              />
            </label>

            <label className={styles.label}>
              What could be better
              <textarea
                name="improvements"
                defaultValue={existingRequesterReview?.improvements ?? ""}
                className={styles.textarea}
                rows={3}
                placeholder="More detailed directions, earlier notice, clearer scope…"
              />
            </label>

            <label className={styles.checkboxRow}>
              <input type="checkbox" name="would_work_again" defaultChecked={existingRequesterReview?.would_work_again ?? false} />{" "}
              I would volunteer for this requester again
            </label>

            <div className={styles.actionsRow} style={{ marginTop: "0.5rem" } as any}>
              <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
                Save review
              </button>
              <ShareButton target={{ type: "request", ref: app.opportunity.id, title: app.opportunity.title }} label="Share thank you" className={styles.button} />
              {existingRequesterReview ? <span className={styles.meta}>Last updated: {new Date(existingRequesterReview.created_at).toLocaleString()}</span> : null}
            </div>
          </form>
        </div>
      ) : null}

{app.message ? (
        <div className={styles.sectionCard}>
          <h3 className={styles.sectionTitle}>Your message</h3>
          <p className={styles.tileBody}>{app.message}</p>
        </div>
      ) : null}
    </div>
  );
}

