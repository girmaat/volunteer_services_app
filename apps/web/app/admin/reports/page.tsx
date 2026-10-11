import styles from "./reports.module.css";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type ReportRow = {
  source?: string;
  share_token?: string | null;
  share_destination_path?: string | null;
  share_type?: string | null;
  share_revoked_at?: string | null;
  share_moderation_state?: string | null;
  share_revoked_reason?: string | null;
  share_report_count?: number | null;
  share_distinct_24h?: number | null;
  id: string;
  category: string;
  details: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reporter_email: string;
  target_user_id: string | null;
  target_email: string | null;
  target_request_id: string | null;
  target_request_title: string | null;
};

async function loadReports(status: string): Promise<{ rows: ReportRow[]; error: string | null }> {
  const url = status ? `/v1/admin/reports?status=${encodeURIComponent(status)}` : "/v1/admin/reports";
  const res = await backendFetch(url, { method: "GET" });

  if (!res.ok) {
    let msg = `Failed to load reports (HTTP ${res.status})`;
    try {
      const j: any = await res.json();
      if (j?.message) msg = String(j.message);
    } catch {
      // ignore
    }
    return { rows: [], error: msg };
  }

  const json = (await res.json().catch(() => ({}))) as { reports?: ReportRow[] };
  return { rows: json.reports || [], error: null };
}

function truncate(s: unknown, max = 180) {
  const v = String(s || "");
  if (v.length <= max) return v;
  return `${v.slice(0, Math.max(0, max - 1))}…`;
}

function statusBadge(s: string) {
  const v = String(s || "");
  if (v === "resolved") return <span className="badge badgeOk">Resolved</span>;
  if (v === "dismissed") return <span className="badge">Dismissed</span>;
  if (v === "in_review") return <span className="badge badgeWarn">In review</span>;
  return <span className="badge badgeWarn">Submitted</span>;
}

function sourceBadge(source?: string) {
  if (source === "share_report") return <span className="badge">Share link</span>;
  return <span className="badge">User report</span>;
}

function linkStateBadge(r: ReportRow) {
  const revoked = Boolean(r.share_revoked_at);
  const state = String(r.share_moderation_state || "").toLowerCase();
  const reported = state === "reported" || (Number(r.share_report_count || 0) > 0 && !revoked);
  if (revoked || state === "blocked") return <span className="badge badgeBad">Blocked</span>;
  if (reported) return <span className="badge badgeWarn">Reported</span>;
  return <span className="badge badgeOk">Clean</span>;
}

export default async function Page(
  props: {
    searchParams?: Promise<{ status?: string; error?: string; ok?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const status = String(searchParams?.status || "").trim();
  const loaded = await loadReports(status);
  const rows = loaded.rows;

  async function updateReport(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const nextStatus = String(formData.get("status") || "");
    const notes = String(formData.get("admin_notes") || "");

    const res = await backendFetch(`/v1/admin/reports/${encodeURIComponent(id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus || undefined, admin_notes: notes || null })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok)
      redirect(
        `/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}error=${encodeURIComponent(
          String(json?.message || "Failed")
        )}`
      );
    revalidatePath("/admin/reports");
    redirect(`/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}ok=1`);
  }

  async function moderateShareLink(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const action = String(formData.get("action") || "");
    const notes = String(formData.get("admin_notes") || "");

    const res = await backendFetch(`/v1/admin/share-reports/${encodeURIComponent(id)}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, admin_notes: notes || null })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok)
      redirect(
        `/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}error=${encodeURIComponent(
          String(json?.message || "Failed")
        )}`
      );
    revalidatePath("/admin/reports");
    redirect(`/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}ok=1`);
  }

  async function strikeUser(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const reason = String(formData.get("reason") || "Report violation");
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/strike`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok)
      redirect(
        `/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}error=${encodeURIComponent(
          String(json?.message || "Failed")
        )}`
      );
    revalidatePath("/admin/reports");
    redirect(`/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}ok=1`);
  }

  async function banUser(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const days = Number(formData.get("days") || 7);
    const reason = String(formData.get("reason") || "Report violation");
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/ban`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ until, reason })
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok)
      redirect(
        `/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}error=${encodeURIComponent(
          String(json?.message || "Failed")
        )}`
      );
    revalidatePath("/admin/reports");
    redirect(`/admin/reports?${status ? `status=${encodeURIComponent(status)}&` : ""}ok=1`);
  }

  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";
  const ok = searchParams?.ok === "1";
  const loadError = loaded.error;

  return (
    <div className="adminGrid">
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <h1 style={{ margin: 0 }}>Reports queue</h1>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
            Review user-submitted reports and take action.
          </p>
        </div>

        <form method="get" action="/admin/reports" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="input" name="status" aria-label="Status" defaultValue={status || ""}>
            <option value="">All</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
          <button className="btn" type="submit">
            Filter
          </button>
        </form>
      </header>

      {ok ? (
        <div className="adminCard" style={{ borderColor: "rgba(0,120,0,0.25)", background: "rgba(0,120,0,0.05)" }}>
          <strong>Saved.</strong>
        </div>
      ) : null}

      {loadError ? (
        <div className="adminCard" style={{ border: "1px solid rgba(220, 53, 69, .35)" }}>
          <div style={{ fontWeight: 900 }}>Could not load reports</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {loadError}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="adminCard" style={{ borderColor: "rgba(180,0,0,0.25)", background: "rgba(180,0,0,0.05)" }}>
          <strong>Couldn&apos;t complete that action.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      {rows.map((r) => {
        const created = r.created_at ? new Date(r.created_at).toLocaleString() : "";
        const detailsPreview = truncate(r.details, 180);
        const targetBits = [
          r.target_email ? `Target: ${r.target_email}` : "Target: —",
          r.target_request_title ? `Request: ${truncate(r.target_request_title, 60)}` : null,
          r.source === "share_report" && r.share_destination_path ? `Path: ${truncate(r.share_destination_path, 60)}` : null
        ].filter(Boolean);

        return (
          <div key={r.id} className="adminCard">
            <div className={styles.row}>
              <div className={styles.left}>
                <div className={styles.titleRow}>
                  <div className={styles.category}>{r.category}</div>
                  <div className={styles.badges}>
                    {sourceBadge(r.source)}
                    {statusBadge(r.status)}
                    {r.source === "share_report" ? linkStateBadge(r) : null}
                    {r.source === "share_report" && Number(r.share_distinct_24h || 0) >= 3 ? (
                      <span className="badge badgeWarn">Auto-block threshold</span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.meta}>
                  Reported by <strong>{r.reporter_email}</strong> · {created}
                  {r.source === "share_report" ? (
                    <>
                      {' '}· Reports: <strong>{Number(r.share_report_count || 0)}</strong> (distinct 24h:{' '}
                      <strong>{Number(r.share_distinct_24h || 0)}</strong>)
                    </>
                  ) : null}
                </div>

                <div className={styles.preview}>{detailsPreview}</div>

                <div className={styles.submeta}>{targetBits.join(" · ")}</div>
              </div>

              <div className={styles.right}>
                <div className={styles.controls}>
                  <a className={`btn btnSoft ${styles.actionBtn}`} href={`/admin/reports/${encodeURIComponent(r.id)}`}>
                    View details
                  </a>
                  {r.source === "share_report" && r.share_token ? (
                    <a className={`btn ${styles.actionBtn}`} href={`/share/${r.share_token}`} target="_blank" rel="noreferrer">
                      Open shared page
                    </a>
                  ) : null}

                  <details className={styles.actionsDetails}>
                    <summary className={`btn btnSoft ${styles.actionBtn} ${styles.actionsSummary}`}>Actions</summary>
                    <div className={styles.actionsPanel}>
                      <form action={updateReport} className={styles.formGrid}>
                      <input type="hidden" name="id" value={r.id} />
                      <select className="input" name="status" aria-label="Status" defaultValue={r.status}>
                        <option value="submitted">Submitted</option>
                        <option value="in_review">In review</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                      <textarea
                        className="input"
                        name="admin_notes" aria-label="Admin notes"
                        defaultValue={r.admin_notes || ""}
                        rows={3}
                        placeholder="Admin notes"
                      />
                      <button className="btn" type="submit">
                        Update status
                      </button>
                      </form>

                      {r.source === "share_report" ? (
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                          Share-link moderation
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                          Policy: The platform shows a warning after the first report and auto-blocks at{' '}
                          <strong>3 distinct reports in 24h</strong> (or <strong>2</strong> for scam/phishing).
                        </div>
                        <div className="adminActions">
                          <form action={moderateShareLink}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="action" value="warn" />
                            <input type="hidden" name="admin_notes" value={r.admin_notes || ""} />
                            <button className="btn" type="submit">
                              Warn
                            </button>
                          </form>
                          <form action={moderateShareLink}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="action" value="block" />
                            <input type="hidden" name="admin_notes" value={r.admin_notes || ""} />
                            <button className="btn btnDanger" type="submit">
                              Block
                            </button>
                          </form>
                          <form action={moderateShareLink}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="action" value="unblock" />
                            <input type="hidden" name="admin_notes" value={r.admin_notes || ""} />
                            <button className="btn" type="submit">
                              Unblock
                            </button>
                          </form>
                          <form action={moderateShareLink}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="action" value="clear" />
                            <input type="hidden" name="admin_notes" value={r.admin_notes || ""} />
                            <button className="btn" type="submit">
                              Clear warning
                            </button>
                          </form>
                        </div>
                      </div>
                    ) : null}

                    {r.target_user_id ? (
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                        <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                          Enforcement
                        </div>
                        <div className="adminActions">
                          <form action={strikeUser}>
                            <input type="hidden" name="user_id" value={r.target_user_id} />
                            <input type="hidden" name="reason" value={`Report: ${r.category}`} />
                            <button className="btn" type="submit">
                              Strike user
                            </button>
                          </form>
                          <form action={banUser}>
                            <input type="hidden" name="user_id" value={r.target_user_id} />
                            <input type="hidden" name="reason" value={`Report: ${r.category}`} />
                            <select className="input" name="days" aria-label="Days" defaultValue="7">
                              <option value="1">1d</option>
                              <option value="7">7d</option>
                              <option value="30">30d</option>
                            </select>
                            <button className="btn btnDanger" type="submit">
                              Ban
                            </button>
                          </form>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  </details>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
