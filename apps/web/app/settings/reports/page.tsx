
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { backendFetch } from "../../lib/backend";
import styles from "../settings.module.css";

export const dynamic = "force-dynamic";

type Peer = {
  id: string;
  email: string;
  display_name: string | null;
};

type ReportableRequest = {
  id: string;
  title: string;
  created_at: string;
  role: "volunteer" | "requester";
  organization_name: string | null;
};

type ReportRow = {
  id: string;
  category: string;
  details: string;
  status: "submitted" | "in_review" | "resolved" | "dismissed";
  created_at: string;
  updated_at: string;

  target_user_id: string | null;
  target_user_email: string | null;
  target_user_display_name: string | null;

  target_request_id: string | null;
  target_request_title: string | null;
  target_request_org_name: string | null;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusLabel(s: ReportRow["status"]) {
  if (s === "submitted") return "Submitted";
  if (s === "in_review") return "In review";
  if (s === "resolved") return "Resolved";
  if (s === "dismissed") return "Dismissed";
  return s;
}

async function getReportables() {
  const res = await backendFetch("/v1/settings/reportables", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load reportables");
  const data = (await res.json()) as any;
  return {
    peers: (data?.peers as Peer[]) || [],
    requests: (data?.requests as ReportableRequest[]) || []
  };
}

async function getReports(): Promise<ReportRow[]> {
  const res = await backendFetch("/v1/settings/reports", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load reports");
  return (await res.json()) as ReportRow[];
}

export default async function Page() {
  const [{ peers, requests }, reports] = await Promise.all([getReportables(), getReports()]);

  async function fileReport(formData: FormData) {
    "use server";

    const target_type = String(formData.get("target_type") || "other") as "user" | "request" | "other";
    const target_user_id = String(formData.get("target_user_id") || "").trim() || undefined;
    const target_request_id = String(formData.get("target_request_id") || "").trim() || undefined;
    const category = String(formData.get("category") || "other");
    const details = String(formData.get("details") || "").trim();

    if (!details) return;

    const res = await backendFetch("/v1/settings/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_type, target_user_id, target_request_id, category, details })
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body || "Failed to file report");
    }

    revalidatePath("/settings/reports");
    revalidatePath("/settings");
  }

  return (
    <>
      <h2 className={styles.sectionTitle}>Reports filed</h2>
      <p className={styles.meta}>
        Submit a report about a user or a request. You can also report something without selecting a target.
      </p>

      <form action={fileReport}>
        <div className={styles.row}>
          <label className={`${styles.label} flex-1`}>
            Target type
            <select name="target_type" className={styles.select} defaultValue="user">
              <option value="user">User</option>
              <option value="request">Request</option>
              <option value="other">Other / general</option>
            </select>
          </label>

          <label className={`${styles.label} flex-1`}>
            Category
            <select name="category" className={styles.select} defaultValue="safety">
              <option value="harassment">Harassment</option>
              <option value="spam">Spam</option>
              <option value="scam">Scam / fraud</option>
              <option value="safety">Safety concern</option>
              <option value="hate">Hate / hateful content</option>
              <option value="sexual">Sexual content</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className={styles.row}>
          <label className={`${styles.label} flex-1`}>
            User (if reporting a user)
            <select name="target_user_id" className={styles.select} defaultValue="">
              <option value="">— Select —</option>
              {peers.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.display_name || p.email) + " (" + p.email + ")"}
                </option>
              ))}
            </select>
          </label>

          <label className={`${styles.label} flex-1`}>
            Request (if reporting a request)
            <select name="target_request_id" className={styles.select} defaultValue="">
              <option value="">— Select —</option>
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title + (r.organization_name ? " • " + r.organization_name : "")}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={styles.label}>
          What happened?
          <textarea
            name="details"
            className={styles.textarea}
            placeholder="Please include enough detail for review (at least 10 characters)."
          />
        </label>

        <div className={`${styles.row} mt-3`}>
          <button className={styles.button} type="submit">
            File report
          </button>
          <Link prefetch={false} className={styles.buttonSecondary} href="/settings">
            Back to settings
          </Link>
        </div>
      </form>

      <hr className={styles.hr} />

      <h3 className={styles.sectionTitle}>Your submitted reports</h3>

      {reports.length === 0 ? (
        <p className={styles.meta}>You haven’t filed any reports yet.</p>
      ) : (
        <div className={styles.list}>
          {reports.map((r) => {
            const target =
              r.target_user_id
                ? `${r.target_user_display_name || r.target_user_email}`
                : r.target_request_id
                  ? `${r.target_request_title || "Request"}${r.target_request_org_name ? " • " + r.target_request_org_name : ""}`
                  : "General";

            return (
              <div key={r.id} className={styles.tile}>
                <h4 className={styles.tileTitle}>
                  {statusLabel(r.status)} • {r.category}
                </h4>
                <p className={styles.tileBody}>
                  <strong>Target:</strong> {target}
                </p>
                <p className={styles.tileBody}>
                  <strong>Submitted:</strong> {formatWhen(r.created_at)} • <strong>Updated:</strong> {formatWhen(r.updated_at)}
                </p>
                <p className={styles.tileBody}>{r.details.length > 220 ? r.details.slice(0, 220) + "…" : r.details}</p>
                <div className={styles.badgeRow}>
                  <span className={styles.badge}>Status: {statusLabel(r.status)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
