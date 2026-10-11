import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../../../lib/backend";
import { getOrgContext } from "../../../../lib/org";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../../../org.module.css";

export const dynamic = "force-dynamic";

type AppRow = {
  application_id: string;
  request_id: string;
  status: string;
  message: string | null;
  created_at: string;
  volunteer_user_id: string;
  volunteer_email: string;
  volunteer_display_name: string | null;
  volunteer_public_location: string | null;

  commitment_id?: string | null;
  commitment_status?: string | null;
  commitment_start_at?: string | null;
  commitment_end_at?: string | null;
};

function toDateTimeLocalValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

async function load(id: string): Promise<AppRow[]> {
  const res = await backendFetch(`/v1/org/requests/${id}/applications`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load applications");
  const data = await res.json();
  return (data?.applications || []) as AppRow[];
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const rows = await load(params.id);

  async function setStatus(formData: FormData) {
    "use server";
    const applicationId = String(formData.get("applicationId") || "").trim();
    const status = String(formData.get("status") || "").trim();
    if (!applicationId || !status) return;

    const res = await backendFetch(`/v1/org/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Update failed"));
      redirect(`/org/requests/${params.id}/applications?error=${msg}`);
    }

    revalidatePath(`/org/requests/${params.id}/applications`);
    revalidatePath(`/org/requests/${params.id}`);
    revalidatePath(`/org/applications`);
  }

  async function confirmAction(formData: FormData) {
    "use server";
    const applicationId = String(formData.get("applicationId") || "").trim();
    const startAt = String(formData.get("start_at") || "").trim();
    const endAt = String(formData.get("end_at") || "").trim();
    if (!applicationId || !startAt) return;

    const res = await backendFetch(`/v1/org/applications/${applicationId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ start_at: startAt, end_at: endAt || undefined })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Confirm failed"));
      redirect(`/org/requests/${params.id}/applications?error=${msg}`);
    }

    revalidatePath(`/org/requests/${params.id}/applications`);
    revalidatePath(`/org/requests/${params.id}`);
    revalidatePath(`/org/applications`);
  }

  async function cancelAction(formData: FormData) {
    "use server";
    const applicationId = String(formData.get("applicationId") || "").trim();
    if (!applicationId) return;

    const res = await backendFetch(`/v1/org/applications/${applicationId}/cancel`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Cancel failed"));
      redirect(`/org/requests/${params.id}/applications?error=${msg}`);
    }

    revalidatePath(`/org/requests/${params.id}/applications`);
    revalidatePath(`/org/requests/${params.id}`);
    revalidatePath(`/org/applications`);
  }

  async function completeAction(formData: FormData) {
    "use server";
    const applicationId = String(formData.get("applicationId") || "").trim();
    if (!applicationId) return;

    const res = await backendFetch(`/v1/org/applications/${applicationId}/complete`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = encodeURIComponent(String(err?.message || "Complete failed"));
      redirect(`/org/requests/${params.id}/applications?error=${msg}`);
    }

    revalidatePath(`/org/requests/${params.id}/applications`);
    revalidatePath(`/org/requests/${params.id}`);
    revalidatePath(`/org/applications`);
  }


  return (
    <div className={styles.mainFull}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Applications</h2>
        <Link href={`/org/requests/${params.id}`}>Back to request</Link>
      </div>

      {rows.length === 0 ? (
        <p>No applications yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: 10, paddingLeft: 18 }}>
          {rows.map((a) => {
            const canDecide = a.status === "pending" || a.status === "waitlisted";
            const canWaitlist = a.status === "pending";
            const canUnwaitlist = a.status === "waitlisted";
            const canSchedule = a.status === "accepted" || a.status === "confirmed";
            const canComplete = a.status === "confirmed";

            return (
              <li key={a.application_id} style={{ padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div>
                    <strong>{a.volunteer_display_name || a.volunteer_email}</strong>{" "}
                    <span style={{ opacity: 0.75 }}>· {a.status}</span>
                    {a.volunteer_public_location ? (
                      <div style={{ marginTop: 4, opacity: 0.75 }}>{a.volunteer_public_location}</div>
                    ) : null}
                  </div>

                  <Link href={`/org/messages/${a.volunteer_user_id}?requestId=${a.request_id}&applicationId=${a.application_id}`}>Message</Link>
                </div>

                {a.message ? <div style={{ marginTop: 8 }}>{a.message}</div> : null}

                {canDecide ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <form action={setStatus}>
                      <input type="hidden" name="applicationId" value={a.application_id} />
                      <input type="hidden" name="status" value="accepted" />
                      <button className={styles.badge} type="submit">
                        Accept
                      </button>
                    </form>

                    {canWaitlist ? (
                      <form action={setStatus}>
                        <input type="hidden" name="applicationId" value={a.application_id} />
                        <input type="hidden" name="status" value="waitlisted" />
                        <button className={styles.badge} type="submit">
                          Waitlist
                        </button>
                      </form>
                    ) : null}

                    {canUnwaitlist ? (
                      <form action={setStatus}>
                        <input type="hidden" name="applicationId" value={a.application_id} />
                        <input type="hidden" name="status" value="pending" />
                        <button className={styles.badge} type="submit">
                          Move to pending
                        </button>
                      </form>
                    ) : null}

                    <form action={setStatus}>
                      <input type="hidden" name="applicationId" value={a.application_id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button className={styles.badge} type="submit">
                        Reject
                      </button>
                    </form>
                  </div>
                ) : null}

                {canSchedule ? (
                  <div style={{ marginTop: 10 }}>
                    {a.commitment_start_at ? (
                      <div style={{ opacity: 0.75, marginBottom: 8 }}>
                        Current: <strong>{new Date(a.commitment_start_at).toLocaleString()}</strong>
                        {a.commitment_end_at ? (
                          <>
                            {" "}
                            → <strong>{new Date(a.commitment_end_at).toLocaleString()}</strong>
                          </>
                        ) : null}
                        {a.commitment_status ? ` · ${a.commitment_status}` : ""}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.75, marginBottom: 8 }}>
                        Set a time to confirm this volunteer’s engagement.
                      </div>
                    )}

                    <form action={confirmAction} style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto", alignItems: "end" }}>
                      <input type="hidden" name="applicationId" value={a.application_id} />
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>Start</span>
                        <input type="datetime-local" name="start_at" required defaultValue={toDateTimeLocalValue(a.commitment_start_at ?? null)} />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>End</span>
                        <input type="datetime-local" name="end_at" defaultValue={toDateTimeLocalValue(a.commitment_end_at ?? null)} />
                      </label>
                      <button className={styles.badge} type="submit">
                        {a.status === "accepted" ? "Confirm" : "Save"}
                      </button>
                    </form>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <form action={cancelAction}>
                        <input type="hidden" name="applicationId" value={a.application_id} />
                        <button className={styles.badge} type="submit">
                          Cancel
                        </button>
                      </form>

                      {canComplete ? (
                        <form action={completeAction}>
                          <input type="hidden" name="applicationId" value={a.application_id} />
                          <button className={styles.badge} type="submit">
                            Mark completed
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}