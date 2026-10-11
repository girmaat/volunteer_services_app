
import { revalidatePath } from "next/cache";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import styles from "../../volunteer.module.css";
import HistoryTabs from "../_components/HistoryTabs";
import ShareButton from "../../../_components/share/ShareButton";

export const dynamic = "force-dynamic";

type AppRow = { id: string; opportunity_id: string; opportunity_title: string; status: string };

type ImpactRow = {
  id: string;
  impact_date: string;
  hours: number;
  notes: string | null;
  request_id: string | null;
  request_application_id: string | null;
  title: string | null;
  organization_name: string | null;
};

async function getImpact(): Promise<{ ok: true; rows: ImpactRow[] } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/impact", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load impact log" };
  }
  return { ok: true, rows: (await res.json()) as ImpactRow[] };
}

async function getApplicationsForPicker(): Promise<{ id: string; request_id: string; title: string }[]> {
  const res = await backendFetch("/v1/volunteer/applications", { method: "GET" });
  if (!res.ok) return [];
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({ id: r.id, request_id: r.request_id ?? r.opportunity_id ?? "", title: r.title ?? r.request_title ?? "Opportunity" }));
}


async function addImpact(formData: FormData) {
  "use server";

  const packed = String(formData.get("application") || "");
  const [applicationId, requestId] = packed.split("|");
  const impact_date = String(formData.get("impact_date") || "");
  const hours = Number(formData.get("hours") || 0);
  const notes = String(formData.get("notes") || "").trim();

  if (!requestId || !impact_date) return;

  const res = await backendFetch("/v1/volunteer/history/impact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      request_application_id: applicationId || undefined,
      impact_date,
      hours,
      notes: notes || undefined
    })
  });

  if (!res.ok) {
    throw new Error("Failed to save impact entry");
  }

  revalidatePath("/volunteer/history/impact");
  revalidatePath("/volunteer/history");
  revalidatePath("/volunteer/history/hours");
}

export default async function Page() {
  const [me, impact, apps] = await Promise.all([getCurrentUser(), getImpact(), getApplicationsForPicker()]);
  return (
    <>
      <h1 className={styles.sectionTitle}>Impact log</h1>
      <HistoryTabs active="impact" />

      {me?.id ? (
        <div className={`${styles.actionsRow} mt-2`}>
          <ShareButton target={{ type: "volunteer", ref: me.id, title: "My volunteer profile" }} label="Share impact" className={styles.button} />
        </div>
      ) : null}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Log impact</h2>
        <form action={addImpact} className={styles.form}>
          <label className={styles.label}>
            Application
            <select name="application" className={styles.input} required>
              <option value="">Select…</option>
              {apps.map((a) => (
                <option key={a.id} value={`${a.id}|${a.request_id}`}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.row}>
            <label className={`${styles.label} flex-1`}>
              Date
              <input name="impact_date" type="date" className={styles.input} required />
            </label>
            <label className={`${styles.label} flex-1`}>
              Hours
              <input name="hours" type="number" min="0" step="0.25" className={styles.input} defaultValue="1" />
            </label>
          </div>

          <label className={styles.label}>
            Notes
            <textarea name="notes" className={styles.textarea} placeholder="What did you do? Who did it help?"></textarea>
          </label>

          <button className={styles.button} type="submit">
            Save impact
          </button>
        </form>
      </div>

      {!impact.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>Could not load impact log.</strong>
          <div className={styles.meta}>
            Backend responded with {impact.status}. {impact.message}
          </div>
        </div>
      )}

      {impact.ok && impact.rows.length === 0 && <p className={styles.meta}>No impact entries yet.</p>}

      {impact.ok && impact.rows.length > 0 && (
        <div className={styles.list}>
          {impact.rows.map((r) => (
            <div key={r.id} className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.cardTitle}>{r.title || "Unknown opportunity"}</div>
                  <div className={styles.meta}>{r.organization_name || "Independent requester"}</div>
                  <div className={styles.meta}>
                    {new Date(r.impact_date).toLocaleDateString()} · {Number(r.hours || 0)} hours
                  </div>
                </div>
              </div>
              {r.notes && <p className={styles.cardBody}>{r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}


