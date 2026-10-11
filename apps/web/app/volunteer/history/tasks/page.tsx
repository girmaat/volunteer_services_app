
import { revalidatePath } from "next/cache";
import { backendFetch } from "../../../lib/backend";
import styles from "../../volunteer.module.css";
import HistoryTabs from "../_components/HistoryTabs";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  task_date: string;
  task: string;
  duration_hours: number;
  request_id: string | null;
  title: string | null;
  organization_name: string | null;
};

async function getTasks(): Promise<{ ok: true; rows: TaskRow[] } | { ok: false; status: number; message: string }> {
  const res = await backendFetch("/v1/volunteer/history/tasks", { method: "GET" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: txt || "Failed to load tasks" };
  }
  return { ok: true, rows: (await res.json()) as TaskRow[] };
}

async function getApplicationsForPicker(): Promise<{ id: string; request_id: string; title: string }[]> {
  const res = await backendFetch("/v1/volunteer/applications", { method: "GET" });
  if (!res.ok) return [];
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({ id: r.id, request_id: r.request_id ?? r.opportunity_id ?? "", title: r.title ?? r.request_title ?? "Opportunity" }));
}


async function addTask(formData: FormData) {
  "use server";

  const packed = String(formData.get("application") || "");
  const [applicationId, requestId] = packed.split("|");
  const task_date = String(formData.get("task_date") || "");
  const task = String(formData.get("task") || "").trim();
  const duration_hours = Number(formData.get("duration_hours") || 0);

  if (!requestId || !task_date || !task) return;

  const res = await backendFetch("/v1/volunteer/history/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      request_application_id: applicationId || undefined,
      task_date,
      task,
      duration_hours
    })
  });

  if (!res.ok) {
    throw new Error("Failed to save task");
  }

  revalidatePath("/volunteer/history/tasks");
  revalidatePath("/volunteer/history");
  revalidatePath("/volunteer/history/hours");
}

export default async function Page() {
  const [tasks, apps] = await Promise.all([getTasks(), getApplicationsForPicker()]);
  return (
    <>
      <h1 className={styles.sectionTitle}>Tasks</h1>
      <HistoryTabs active="tasks" />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Add task</h2>
        <form action={addTask} className={styles.form}>
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
              <input name="task_date" type="date" className={styles.input} required />
            </label>
            <label className={`${styles.label} flex-1`}>
              Duration (hours)
              <input name="duration_hours" type="number" min="0" step="0.25" className={styles.input} defaultValue="1" />
            </label>
          </div>

          <label className={styles.label}>
            Task
            <input name="task" className={styles.input} placeholder="What did you do?" required />
          </label>

          <button className={styles.button} type="submit">
            Save task
          </button>
        </form>
      </div>

      {!tasks.ok && (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <strong>Could not load tasks.</strong>
          <div className={styles.meta}>
            Backend responded with {tasks.status}. {tasks.message}
          </div>
        </div>
      )}

      {tasks.ok && tasks.rows.length === 0 && <p className={styles.meta}>No tasks yet.</p>}

      {tasks.ok && tasks.rows.length > 0 && (
        <div className={styles.list}>
          {tasks.rows.map((r) => (
            <div key={r.id} className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.cardTitle}>{r.title || "Unknown opportunity"}</div>
                  <div className={styles.meta}>{r.organization_name || "Independent requester"}</div>
                  <div className={styles.meta}>
                    {new Date(r.task_date).toLocaleDateString()} · {Number(r.duration_hours || 0)} hours
                  </div>
                </div>
              </div>
              <p className={styles.cardBody}>{r.task}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
