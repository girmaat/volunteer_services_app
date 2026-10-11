import { inOrg } from "../../../lib/access";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../org.module.css";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";

export const dynamic = "force-dynamic";

type OrgRequest = { id: string; title: string };

type Incident = {
  id: string;
  request_id: string | null;
  request_title: string | null;
  volunteer_user_id: string | null;
  volunteer_email: string | null;
  volunteer_display_name: string | null;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_review" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
};

async function loadRequests(): Promise<OrgRequest[]> {
  const res = await backendFetch(`/v1/org/requests`, { method: "GET" });
  if (!res.ok) return [];
  const json = (await res.json()) as { requests?: OrgRequest[] };
  return Array.isArray(json.requests) ? json.requests : [];
}

async function loadIncidents(searchParams: Record<string, string | string[] | undefined>): Promise<Incident[]> {
  const qs = new URLSearchParams();
  const status = typeof searchParams.status === "string" ? searchParams.status : "";
  const severity = typeof searchParams.severity === "string" ? searchParams.severity : "";
  const requestId = typeof searchParams.requestId === "string" ? searchParams.requestId : "";
  const search = typeof searchParams.search === "string" ? searchParams.search : "";

  if (status) qs.set("status", status);
  if (severity) qs.set("severity", severity);
  if (requestId) qs.set("requestId", requestId);
  if (search) qs.set("search", search);

  const res = await backendFetch(`/v1/org/incidents?${qs.toString()}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load incidents");
  const json = (await res.json()) as { incidents?: Incident[] };
  return Array.isArray(json.incidents) ? json.incidents : [];
}

async function createIncident(formData: FormData) {
  "use server";
  const request_id = String(formData.get("request_id") || "");
  const title = String(formData.get("title") || "");
  const description = String(formData.get("description") || "");
  const severity = String(formData.get("severity") || "medium");

  const payload: any = { title, description, severity };
  if (request_id) payload.request_id = request_id;

  const res = await backendFetch(`/v1/org/incidents`, { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) {
    redirect(`/org/incidents?created=0`);
  }

  revalidatePath("/org/incidents");
  redirect(`/org/incidents?created=1`);
}

function sevBadge(sev: string) {
  if (sev === "critical") return <span className={`${styles.badge} border-danger`}>CRITICAL</span>;
  if (sev === "high") return <span className={styles.badge}>HIGH</span>;
  if (sev === "medium") return <span className={styles.badge}>MED</span>;
  return <span className={styles.badge}>LOW</span>;
}

export default async function Page(
  props: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!inOrg(user)) redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const [requests, incidents] = await Promise.all([loadRequests(), loadIncidents(searchParams)]);

  const status = typeof searchParams.status === "string" ? searchParams.status : "";
  const severity = typeof searchParams.severity === "string" ? searchParams.severity : "";
  const requestId = typeof searchParams.requestId === "string" ? searchParams.requestId : "";
  const search = typeof searchParams.search === "string" ? searchParams.search : "";

  return (
    <div className={styles.mainFull}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h1 className="m-0">Incidents</h1>
        <span className={styles.meta}>Total: {incidents.length}</span>
      </div>

      <div className={`${styles.card} mt-3`}>
        <h2 className="mt-0">Create incident report</h2>
        <form className="grid grid-cols-2 gap-3" action={createIncident}>
          <div className="col-span-full">
            <label className={styles.label}>Request (optional)</label>
            <select className={styles.select} name="request_id" defaultValue="">
              <option value="">(none)</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.label}>Severity</label>
            <select className={styles.select} name="severity" defaultValue="medium">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className={styles.label}>Title</label>
            <input className={styles.input} name="title" placeholder="Short summary" required minLength={2} />
          </div>

          <div className="col-span-full">
            <label className={styles.label}>Description</label>
            <textarea className={styles.textarea} name="description" placeholder="What happened?" required minLength={5} rows={5} />
          </div>

          <div>
            <button className={styles.primaryButton} type="submit">
              Create
            </button>
          </div>
        </form>
      </div>

      <form className={`${styles.card} mt-3 grid grid-cols-[1fr_1fr_1fr_2fr_auto] gap-2.5 items-end`}>
        <div>
          <label className={styles.label}>Status</label>
          <select className={styles.select} name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div>
          <label className={styles.label}>Severity</label>
          <select className={styles.select} name="severity" defaultValue={severity}>
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label className={styles.label}>Request</label>
          <select className={styles.select} name="requestId" defaultValue={requestId}>
            <option value="">All</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={styles.label}>Search</label>
          <input className={styles.input} name="search" defaultValue={search} placeholder="Title, description, volunteer" />
        </div>

        <div>
          <button className={styles.primaryButton} type="submit">
            Filter
          </button>
        </div>
      </form>

      <div className={`${styles.card} mt-3`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When</th>
              <th>Status</th>
              <th>Severity</th>
              <th>Title</th>
              <th>Request</th>
              <th>Volunteer</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  No incidents.
                </td>
              </tr>
            ) : (
              incidents.map((i) => (
                <tr key={i.id}>
                  <td>{new Date(i.created_at).toLocaleString()}</td>
                  <td>
                    <span className={styles.badge}>{i.status.replace(/_/g, " ")}</span>
                  </td>
                  <td>{sevBadge(i.severity)}</td>
                  <td>
                    <Link prefetch={false} href={`/org/incidents/${i.id}`}>{i.title}</Link>
                  </td>
                  <td>{i.request_id ? <Link prefetch={false} href={`/org/requests/${i.request_id}`}>{i.request_title || i.request_id}</Link> : "-"}</td>
                  <td>{i.volunteer_display_name || i.volunteer_email || i.volunteer_user_id || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
