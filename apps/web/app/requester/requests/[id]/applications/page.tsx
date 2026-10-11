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

type ApplicationRow = {
  id: string;
  request_id: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn" | "confirmed" | "completed" | string;
  message: string | null;
  created_at: string;
  updated_at: string;
  volunteer_user_id: string;

  // Public-safe volunteer profile fields
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
  volunteer_bio: string | null;

  // Legacy fields (backward compatibility with older DBs / payloads)
  volunteer_full_name?: string | null;
  volunteer_location?: string | null;

  volunteer_verification_status: string | null;

  // Commitment (scheduling) if created
  commitment_id?: string | null;
  commitment_status?: string | null;
  commitment_start_at?: string | null;
  commitment_end_at?: string | null;
};

async function loadRequest(id: string): Promise<RequestDetail> {
  const res = await backendFetch(`/v1/requester/requests/${id}`, { method: "GET" });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load request");
  return res.json();
}

async function loadApplications(requestId: string): Promise<ApplicationRow[]> {
  const res = await backendFetch(`/v1/requester/requests/${requestId}/applications`, { method: "GET" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("Failed to load applications");
  return (await res.json()) as ApplicationRow[];
}

function statusLabel(s: string) {
  if (s === "pending") return "Pending";
  if (s === "waitlisted") return "Waitlisted";
  if (s === "accepted") return "Accepted";
  if (s === "rejected") return "Rejected";
  if (s === "withdrawn") return "Withdrawn";
  if (s === "confirmed") return "Confirmed";
  if (s === "completed") return "Completed";
  if (s === "canceled") return "Canceled";
  return s;
}

function appStatusClass(s: string) {
  if (s === "pending" || s === "waitlisted") return styles.appStatusPending;
  if (s === "accepted" || s === "confirmed") return styles.appStatusAccepted;
  if (s === "rejected") return styles.appStatusRejected;
  if (s === "canceled") return styles.appStatusRejected;
  return "";
}

function toDateTimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

function verificationLabel(v: string | null) {
  if (!v) return "";
  if (v === "approved") return "Verified";
  if (v === "submitted") return "Verification submitted";
  if (v === "rejected") return "Verification rejected";
  if (v === "required") return "Verification required";
  return "";
}

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ saved?: string; error?: string; reviewSaved?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const id = params.id;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) notFound();

  const request = await loadRequest(id);
  const applications = await loadApplications(id);

  const savedBanner = searchParams?.saved === "1";
  const reviewSavedBanner = searchParams?.reviewSaved === "1";
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  async function acceptAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "").trim();
    if (!applicationId) {
      redirect(`/requester/requests/${id}/applications?error=${encodeURIComponent("Missing application id")}`);
    }

    const res = await backendFetch(`/v1/requester/applications/${applicationId}/accept`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Accept failed"));
      redirect(`/requester/requests/${id}/applications?error=${msg}`);
    }

    revalidatePath(`/requester/requests/${id}/applications`);
    revalidatePath(`/requester/requests/${id}`);
    revalidatePath(`/requester/requests`);

    redirect(`/requester/requests/${id}/applications?saved=1`);
  }

  async function reviewAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "").trim();
    const rating = Number(formData.get("rating") || 0);
    const strengths = String(formData.get("strengths") || "").trim();
    const improvements = String(formData.get("improvements") || "").trim();
    const wouldWorkAgain = String(formData.get("would_work_again") || "") === "on";

    if (!applicationId || !rating) {
      redirect(`/requester/requests/${id}/applications?error=${encodeURIComponent("Missing review fields")}`);
    }

    const res = await backendFetch(`/v1/requester/applications/${applicationId}/review`, {
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
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Review failed"));
      redirect(`/requester/requests/${id}/applications?error=${msg}`);
    }

    revalidatePath(`/requester/requests/${id}/applications`);
    redirect(`/requester/requests/${id}/applications?reviewSaved=1`);
  }


  async function rejectAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "").trim();
    if (!applicationId) {
      redirect(`/requester/requests/${id}/applications?error=${encodeURIComponent("Missing application id")}`);
    }

    const res = await backendFetch(`/v1/requester/applications/${applicationId}/reject`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Reject failed"));
      redirect(`/requester/requests/${id}/applications?error=${msg}`);
    }

    revalidatePath(`/requester/requests/${id}/applications`);
    revalidatePath(`/requester/requests/${id}`);
    revalidatePath(`/requester/requests`);

    redirect(`/requester/requests/${id}/applications?saved=1`);

  }

  async function confirmAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "").trim();
    const startAt = String(formData.get("start_at") || "").trim();
    const endAt = String(formData.get("end_at") || "").trim();

    if (!applicationId || !startAt) {
      redirect(`/requester/requests/${id}/applications?error=${encodeURIComponent("Missing schedule fields")}`);
    }

    const res = await backendFetch(`/v1/requester/applications/${applicationId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ start_at: startAt, end_at: endAt || undefined })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Confirm failed"));
      redirect(`/requester/requests/${id}/applications?error=${msg}`);
    }

    revalidatePath(`/requester/requests/${id}/applications`);
    revalidatePath(`/requester/requests/${id}`);
    revalidatePath(`/requester/requests`);
    redirect(`/requester/requests/${id}/applications?saved=1`);
  }

  async function cancelAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "").trim();
    if (!applicationId) {
      redirect(`/requester/requests/${id}/applications?error=${encodeURIComponent("Missing application id")}`);
    }

    const res = await backendFetch(`/v1/requester/applications/${applicationId}/cancel`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Cancel failed"));
      redirect(`/requester/requests/${id}/applications?error=${msg}`);
    }

    revalidatePath(`/requester/requests/${id}/applications`);
    revalidatePath(`/requester/requests/${id}`);
    revalidatePath(`/requester/requests`);
    redirect(`/requester/requests/${id}/applications?saved=1`);
  }

  async function completeAction(formData: FormData) {
    "use server";

    const applicationId = String(formData.get("applicationId") || "").trim();
    if (!applicationId) {
      redirect(`/requester/requests/${id}/applications?error=${encodeURIComponent("Missing application id")}`);
    }

    const res = await backendFetch(`/v1/requester/applications/${applicationId}/complete`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Complete failed"));
      redirect(`/requester/requests/${id}/applications?error=${msg}`);
    }

    revalidatePath(`/requester/requests/${id}/applications`);
    revalidatePath(`/requester/requests/${id}`);
    redirect(`/requester/requests/${id}/applications?saved=1`);
  }

  return (
    <>
      <div className={styles.row}>
        <div>
          <h1 className={styles.sectionTitle}>Applicants</h1>
          <p className={styles.meta}>
            Volunteers who applied to <strong>{request.title}</strong>.
          </p>
        </div>
        <div className={styles.actionsRow} style={{ marginTop: 0 } as any}>
          <Link className={styles.navLink} href={`/requester/requests/${id}`}>
            Back to request
          </Link>
        </div>
      </div>

      {savedBanner ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Decision saved</p>
          <p className={styles.bannerBody}>This applicant’s status has been updated.</p>
        </div>
      ) : null}

      {reviewSavedBanner ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Review saved</p>
          <p className={styles.bannerBody}>Thanks — this feedback will appear on the volunteer’s profile.</p>
        </div>
      ) : null}

      {error ? (
        <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
          <p className={styles.bannerTitle}>Couldn’t update applicant</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : null}

      {applications.length === 0 ? (
        <div className={styles.banner}>
          <p className={styles.bannerTitle}>No applicants yet</p>
          <p className={styles.bannerBody}>When volunteers apply, they’ll show up here with their message.</p>
        </div>
      ) : null}

      <div className={styles.list} aria-label="Applicants list">
        {applications.map((a) => {
          const name = a.volunteer_display_name || a.volunteer_full_name || "Volunteer";
          const verification = verificationLabel(a.volunteer_verification_status);
          const canDecide = a.status === "pending";

          return (
            <div key={a.id} className={styles.tile}>
              <div className={styles.row}>
                <div>
                  <h2 className={styles.tileTitle} style={{ margin: 0 } as any}>
                    {name}
                  </h2>
                  <p className={styles.meta} style={{ marginTop: "0.35rem" } as any}>
                    <Link href={`/volunteers/${a.volunteer_user_id}`}>View profile</Link>
                  </p>
                  <p className={styles.meta} style={{ marginTop: "0.35rem" } as any}>
                    {a.volunteer_public_location || a.volunteer_location ? (a.volunteer_public_location || a.volunteer_location) : ""}
                    {(a.volunteer_public_location || a.volunteer_location) && verification ? " · " : ""}
                    {verification ? verification : ""}
                    {!(a.volunteer_public_location || a.volunteer_location) && !verification ? "—" : ""}
                  </p>
                </div>

                <span className={`${styles.badge} ${appStatusClass(a.status)}`.trim()}>{statusLabel(a.status)}</span>
              </div>

              {a.volunteer_bio ? <p className={styles.tileBody}>{a.volunteer_bio}</p> : null}

              {a.message ? (
                <div className={styles.banner} style={{ marginTop: "0.75rem", marginBottom: 0 } as any}>
                  <p className={styles.bannerTitle} style={{ fontSize: "0.9rem" } as any}>
                    Message
                  </p>
                  <p className={styles.bannerBody}>{a.message}</p>
                </div>
              ) : null}

              <div className={styles.badges} aria-label="Application metadata">
                <span className={styles.badge} title={new Date(a.created_at).toLocaleString()}>
                  Applied {new Date(a.created_at).toLocaleDateString()}
                </span>
                <span className={styles.badge} title={new Date(a.updated_at).toLocaleString()}>
                  Updated {new Date(a.updated_at).toLocaleDateString()}
                </span>
              </div>

              {canDecide ? (
  <div className={styles.actionsRow}>
    <form action={acceptAction}>
      <input type="hidden" name="applicationId" value={a.id} />
      <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
        Accept
      </button>
    </form>

    <Link className={styles.button} href={`/inbox/start?requestId=${id}&volunteerId=${a.volunteer_user_id}`}>
      Message
    </Link>

    <form action={rejectAction}>
      <input type="hidden" name="applicationId" value={a.id} />
      <button className={`${styles.button} ${styles.buttonDanger}`.trim()} type="submit">
        Reject
      </button>
    </form>
  </div>
) : (
  <div className={styles.actionsRow}>
    <Link className={styles.button} href={`/inbox/start?requestId=${id}&volunteerId=${a.volunteer_user_id}`}>
      Message
    </Link>

    {(a.status === "accepted" || a.status === "confirmed") ? (
      <>
        <form action={cancelAction}>
          <input type="hidden" name="applicationId" value={a.id} />
          <button className={`${styles.button} ${styles.buttonDanger}`.trim()} type="submit">
            Cancel engagement
          </button>
        </form>

        {a.status === "confirmed" ? (
          <form action={completeAction}>
            <input type="hidden" name="applicationId" value={a.id} />
            <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
              Mark completed
            </button>
          </form>
        ) : null}
      </>
    ) : null}
  </div>
)}

{(a.status === "accepted" || a.status === "confirmed") ? (
  <div className={styles.banner} style={{ marginTop: "0.9rem", marginBottom: 0 } as any}>
    <p className={styles.bannerTitle} style={{ fontSize: "0.95rem" } as any}>
      {a.status === "accepted" ? "Confirm & schedule" : "Update schedule"}
    </p>

    {a.commitment_start_at ? (
      <p className={styles.bannerBody} style={{ marginTop: "0.35rem" } as any}>
        Current:{" "}
        <strong>{new Date(a.commitment_start_at).toLocaleString()}</strong>
        {a.commitment_end_at ? (
          <>
            {" "}
            → <strong>{new Date(a.commitment_end_at).toLocaleString()}</strong>
          </>
        ) : null}
        {a.commitment_status ? ` · ${a.commitment_status}` : ""}
      </p>
    ) : (
      <p className={styles.bannerBody} style={{ marginTop: "0.35rem" } as any}>
        Set a time with the volunteer to confirm this engagement.
      </p>
    )}

    <form action={confirmAction} className={styles.form} style={{ marginTop: "0.6rem" } as any}>
      <input type="hidden" name="applicationId" value={a.id} />
      <label className={styles.label}>
        Start
        <input
          className={styles.input}
          type="datetime-local"
          name="start_at"
          required
          defaultValue={toDateTimeLocalValue(a.commitment_start_at ?? null)}
        />
      </label>
      <label className={styles.label}>
        End (optional)
        <input
          className={styles.input}
          type="datetime-local"
          name="end_at"
          defaultValue={toDateTimeLocalValue(a.commitment_end_at ?? null)}
        />
      </label>
      <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
        {a.status === "accepted" ? "Confirm volunteer" : "Save schedule"}
      </button>
    </form>
  </div>
) : null}

              {a.status === "completed" ? (
                <div className={styles.banner} style={{ marginTop: "0.9rem", marginBottom: 0 } as any}>
                  <p className={styles.bannerTitle} style={{ fontSize: "0.95rem" } as any}>
                    Leave a review
                  </p>
                  <form action={reviewAction} className={styles.form} style={{ marginTop: "0.5rem" } as any}>
                    <input type="hidden" name="applicationId" value={a.id} />
                    <label className={styles.label}>
                      Rating
                      <select name="rating" className={styles.input} required defaultValue="5">
                        <option value="5">5 — Excellent</option>
                        <option value="4">4 — Good</option>
                        <option value="3">3 — OK</option>
                        <option value="2">2 — Needs improvement</option>
                        <option value="1">1 — Poor</option>
                      </select>
                    </label>
                    <label className={styles.label}>
                      What went well (optional)
                      <textarea name="strengths" className={styles.textarea} placeholder="What did the volunteer do well?"></textarea>
                    </label>
                    <label className={styles.label}>
                      Could improve (optional)
                      <textarea name="improvements" className={styles.textarea} placeholder="Anything to do differently next time?"></textarea>
                    </label>
                    <label className={styles.checkboxRow}>
                      <input type="checkbox" name="would_work_again" defaultChecked />
                      Would work with them again
                    </label>
                    <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
                      Save review
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}