
import { revalidatePath } from "next/cache";
import { backendFetch } from "../../../lib/backend";
import styles from "../../volunteer.module.css";
import HistoryTabs from "../_components/HistoryTabs";

export const dynamic = "force-dynamic";

type OutcomeRow = {
  id: string;
  outcome_date: string;
  outcome: string;
  quantity: number | null;
  unit: string | null;
  request_id: string | null;
  title: string | null;
  organization_name: string | null;
};

async function getOutcomes(): Promise<{ ok: true; rows: OutcomeRow[] } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/outcomes", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load outcomes" };
  }
  return { ok: true, rows: (await res.json()) as OutcomeRow[] };
}

async function getApplicationsForPicker(): Promise<{ id: string; request_id: string; title: string }[]> {
  const res = await backendFetch("/v1/volunteer/applications", { method: "GET" });
  if (!res.ok) return [];
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({ id: r.id, request_id: r.request_id ?? r.opportunity_id ?? "", title: r.title ?? r.request_title ?? "Opportunity" }));
}


async function addOutcome(formData: FormData) {
  "use server";

  const packed = String(formData.get("application") || "");
  const [applicationId, requestId] = packed.split("|");
  const outcome_date = String(formData.get("outcome_date") || "");
  const outcome = String(formData.get("outcome") || "").trim();
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const unit = String(formData.get("unit") || "").trim();

  if (!requestId || !outcome_date || !outcome) return;

  const quantity = quantityRaw ? Number(quantityRaw) : undefined;

  const res = await backendFetch("/v1/volunteer/history/outcomes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      request_application_id: applicationId || undefined,
      outcome_date,
      outcome,
      quantity: Number.isFinite(quantity as any) ? quantity : undefined,
      unit: unit || undefined
    })
  });

  if (!res.ok) {
    throw new Error("Failed to save outcome");
  }

  revalidatePath("/volunteer/history/outcomes");
  revalidatePath("/volunteer/history");
}

export default async function Page() {
  const [outcomes, apps] = await Promise.all([getOutcomes(), getApplicationsForPicker()]);
  return (
    <>
      <h1 className={styles.sectionTitle}>Outcomes</h1>
      <HistoryTabs active="outcomes" />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Add outcome</h2>
        <form action={addOutcome} className={styles.form}>
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

          <label className={styles.label}>
            Date
            <input name="outcome_date" type="date" className={styles.input} required />
          </label>

          <label className={styles.label}>
            Outcome
            <textarea name="outcome" className={styles.textarea} placeholder="Example: translated 5 documents" required></textarea>
          </label>

          <div className={styles.row}>
            <label className={`${styles.label} flex-1`}>
              Quantity (optional)
              <input name="quantity" type="number" step="0.01" className={styles.input} />
            </label>
            <label className={`${styles.label} flex-1`}>
              Unit (optional)
              <input name="unit" className={styles.input} placeholder="documents, hours, people…" />
            </label>
          </div>

          <button className={styles.button} type="submit">
            Save outcome
          </button>
        </form>
      </div>

      {!outcomes.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>Could not load outcomes.</strong>
          <div className={styles.meta}>
            Backend responded with {outcomes.status}. {outcomes.message}
          </div>
        </div>
      )}

      {outcomes.ok && outcomes.rows.length === 0 && <p className={styles.meta}>No outcomes yet.</p>}

      {outcomes.ok && outcomes.rows.length > 0 && (
        <div className={styles.list}>
          {outcomes.rows.map((r) => (
            <div key={r.id} className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.cardTitle}>{r.title || "Unknown opportunity"}</div>
                  <div className={styles.meta}>{r.organization_name || "Independent requester"}</div>
                  <div className={styles.meta}>{new Date(r.outcome_date).toLocaleDateString()}</div>
                </div>
                <div className={styles.badges}>
                  {r.quantity !== null && <span className={styles.badge}>{r.quantity}{r.unit ? ` ${r.unit}` : ""}</span>}
                </div>
              </div>
              <p className={styles.cardBody}>{r.outcome}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
