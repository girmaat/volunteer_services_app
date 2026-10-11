import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
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

type ReportCapabilities = {
  share_reports_moderation_cols?: boolean;
  share_links_moderation_cols?: boolean;
};

async function loadReport(id: string): Promise<{ report: ReportRow | null; error: string | null; capabilities: ReportCapabilities | null }> {
  const res = await backendFetch(`/v1/admin/reports/${encodeURIComponent(id)}`, { method: "GET" });
  if (!res.ok) {
    let msg = `Failed to load report (HTTP ${res.status})`;
    try {
      const j: any = await res.json();
      if (j?.message) msg = String(j.message);
    } catch {
      // ignore
    }
    return { report: null, error: msg, capabilities: null };
  }
  const json = (await res.json().catch(() => ({}))) as { report?: ReportRow; capabilities?: ReportCapabilities };
  return { report: json.report || null, error: null, capabilities: json.capabilities || null };
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
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ ok?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const id = String(params.id || "").trim();
  if (!id) redirect("/admin/reports");

  const loaded = await loadReport(id);
  const report = loaded.report;
  const caps = loaded.capabilities || {};
  const canUpdateShareReport = Boolean(caps.share_reports_moderation_cols);
  const canSetShareWarning = Boolean(caps.share_links_moderation_cols);

  async function updateReport(formData: FormData) {
    "use server";
    const nextStatus = String(formData.get("status") || "");
    const notes = String(formData.get("admin_notes") || "");

    const res = await backendFetch(`/v1/admin/reports/${encodeURIComponent(id)}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus || undefined, admin_notes: notes || null })
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) redirect(`/admin/reports/${encodeURIComponent(id)}?error=${encodeURIComponent(String(json?.message || "Failed"))}`);

    revalidatePath(`/admin/reports/${encodeURIComponent(id)}`);
    revalidatePath("/admin/reports");
    redirect(`/admin/reports/${encodeURIComponent(id)}?ok=1`);
  }

  async function moderateShareLink(formData: FormData) {
    "use server";
    const action = String(formData.get("action") || "");
    const notes = String(formData.get("admin_notes") || "");

    const res = await backendFetch(`/v1/admin/share-reports/${encodeURIComponent(id)}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, admin_notes: notes || null })
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) redirect(`/admin/reports/${encodeURIComponent(id)}?error=${encodeURIComponent(String(json?.message || "Failed"))}`);

    revalidatePath(`/admin/reports/${encodeURIComponent(id)}`);
    revalidatePath("/admin/reports");
    redirect(`/admin/reports/${encodeURIComponent(id)}?ok=1`);
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
    if (!res.ok) redirect(`/admin/reports/${encodeURIComponent(id)}?error=${encodeURIComponent(String(json?.message || "Failed"))}`);
    revalidatePath(`/admin/reports/${encodeURIComponent(id)}`);
    revalidatePath("/admin/reports");
    redirect(`/admin/reports/${encodeURIComponent(id)}?ok=1`);
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
    if (!res.ok) redirect(`/admin/reports/${encodeURIComponent(id)}?error=${encodeURIComponent(String(json?.message || "Failed"))}`);
    revalidatePath(`/admin/reports/${encodeURIComponent(id)}`);
    revalidatePath("/admin/reports");
    redirect(`/admin/reports/${encodeURIComponent(id)}?ok=1`);
  }

  const ok = searchParams?.ok === "1";
  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";

  return (
    <div className="adminGrid">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Report details</h2>
          <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>Review the report, update status, and apply moderation actions.</p>
        </div>
        <Link className="btn" href="/admin/reports">Back to reports</Link>
      </header>

      {loaded.error ? (
        <div className="adminCard" style={{ border: "1px solid rgba(220, 53, 69, .35)" }}>
          <div style={{ fontWeight: 900 }}>Could not load report</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{loaded.error}</div>
        </div>
      ) : null}

      {error ? (
        <div className="adminCard" style={{ border: "1px solid rgba(220, 53, 69, .35)" }}>
          <div style={{ fontWeight: 900 }}>Action failed</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      {ok ? (
        <div className="adminCard" style={{ border: "1px solid rgba(0, 120, 0, .25)" }}>
          <div style={{ fontWeight: 900 }}>Saved</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Your changes were applied.</div>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="adminCard">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {sourceBadge(report.source)}
                  {statusBadge(report.status)}
                  {report.source === "share_report" ? linkStateBadge(report) : null}
                </div>
                <div style={{ fontWeight: 900, marginTop: 10 }}><code>{report.category}</code></div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Created: {new Date(report.created_at).toLocaleString()}</div>
              </div>
              <div style={{ minWidth: 280, maxWidth: 520, flex: 1 }}>
                <div className="muted" style={{ fontSize: 12 }}>Reporter</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}><code>{report.reporter_email}</code></div>
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Target</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}><code>{report.target_email || "—"}</code></div>
                {report.target_request_title ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Context: {report.target_request_title}</div>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="muted" style={{ fontSize: 12 }}>Report details</div>
              <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{report.details || <span className="muted">(none)</span>}</div>
            </div>

            {report.source === "share_report" ? (
              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>Share link</div>
                <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                  <div><span className="muted" style={{ fontSize: 12 }}>Token:</span> <code>{report.share_token || "—"}</code></div>
                  <div><span className="muted" style={{ fontSize: 12 }}>Destination:</span> <code>{report.share_destination_path || "—"}</code></div>
                  <div><span className="muted" style={{ fontSize: 12 }}>Type:</span> <code>{report.share_type || "—"}</code></div>
                  <div><span className="muted" style={{ fontSize: 12 }}>Reports:</span> <strong>{Number(report.share_report_count || 0)}</strong> (distinct 24h: <strong>{Number(report.share_distinct_24h || 0)}</strong>)</div>
                </div>
              </div>
            ) : null}
          </div>

	          {report.source === "share_report" && !canUpdateShareReport ? (
	            <div className="adminCard" style={{ border: "1px solid rgba(255, 193, 7, .35)" }}>
	              <div style={{ fontWeight: 900 }}>Update status</div>
	              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
	                This environment can <strong>view</strong> share-link reports, but can’t update their status/notes because your database
	                hasn’t applied the sharing moderation columns yet.
	              </div>
	              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
	                <div className="muted" style={{ fontSize: 12 }}>
	                  To enable status updates, run the sharing schema upgrade as the DB owner:
	                </div>
	                <div className="muted" style={{ fontSize: 12 }}>
	                  <code>backend/scripts/db/apply_sharing_schema.sql</code>
	                </div>
	                <div className="muted" style={{ fontSize: 12 }}>
	                  Or set <code>RUN_MIGRATIONS=1</code> and restart the backend.
	                </div>
	              </div>
	              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
	                <Link className="btn" href="/admin/reports">Back to queue</Link>
	              </div>
	            </div>
	          ) : (
	            <div className="adminCard">
	              <div style={{ fontWeight: 900 }}>Update status</div>
	              <form action={updateReport} style={{ marginTop: 10, display: "grid", gap: 10 }}>
	                <label style={{ display: "grid", gap: 6 }}>
	                  <span className="muted" style={{ fontSize: 12 }}>Status</span>
	                  <select name="status" defaultValue={report.status || "submitted"} className="input">
	                    <option value="submitted">submitted</option>
	                    <option value="in_review">in_review</option>
	                    <option value="resolved">resolved</option>
	                    <option value="dismissed">dismissed</option>
	                  </select>
	                </label>

	                <label style={{ display: "grid", gap: 6 }}>
	                  <span className="muted" style={{ fontSize: 12 }}>Admin notes</span>
	                  <textarea name="admin_notes" defaultValue={report.admin_notes || ""} className="textarea" rows={4} placeholder="Notes for other moderators (not visible to users)" />
	                </label>

	                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
	                  <button className="btn btnSoft" type="submit">Save</button>
	                  <Link className="btn" href="/admin/reports">Back to queue</Link>
	                </div>
	              </form>
	            </div>
	          )}

          {report.target_user_id ? (
            <div className="adminCard">
              <div style={{ fontWeight: 900 }}>User enforcement</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                These actions affect the user who created the reported content (share link owner or in-app target).
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
                <form action={strikeUser} className="adminCard" style={{ padding: 12 }}>
                  <input type="hidden" name="user_id" value={report.target_user_id} />
                  <div style={{ fontWeight: 800 }}>Strike user</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Adds a strike and displays a warning on their profile.</div>
                  <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Reason</span>
                    <input name="reason" className="input" defaultValue="Report violation" />
                  </label>
                  <button className="btn btnSoft" type="submit" style={{ marginTop: 10 }}>Apply strike</button>
                </form>

                <form action={banUser} className="adminCard" style={{ padding: 12 }}>
                  <input type="hidden" name="user_id" value={report.target_user_id} />
                  <div style={{ fontWeight: 800 }}>Temporary ban</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Prevents sign-in until the ban expires.</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "grid", gap: 6, flex: 1, minWidth: 120 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Days</span>
                      <input name="days" className="input" type="number" min={1} max={365} defaultValue={7} />
                    </label>
                    <label style={{ display: "grid", gap: 6, flex: 2, minWidth: 160 }}>
                      <span className="muted" style={{ fontSize: 12 }}>Reason</span>
                      <input name="reason" className="input" defaultValue="Report violation" />
                    </label>
                  </div>
                  <button className="btn btnDanger" type="submit" style={{ marginTop: 10 }}>Ban user</button>
                </form>
              </div>
            </div>
          ) : null}

          {report.source === "share_report" ? (
            <div className="adminCard">
              <div style={{ fontWeight: 900 }}>Share-link moderation</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Policy: 1) first report → warn the owner, 2) repeated or high-signal reports → block the link, 3) unblock/clear when resolved.
              </div>

              <form action={moderateShareLink} style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span className="muted" style={{ fontSize: 12 }}>Moderator notes</span>
                  <textarea name="admin_notes" className="textarea" rows={3} placeholder="Optional notes (stored with the report)" />
                </label>

                <div className="adminActions">
                  <button className="btn btnSoft" type="submit" name="action" value="warn" disabled={!canSetShareWarning}>
                    Warn owner
                  </button>
                  <button className="btn btnDanger" type="submit" name="action" value="block">Block link</button>
                  <button className="btn" type="submit" name="action" value="unblock">Unblock</button>
                  <button className="btn" type="submit" name="action" value="clear" disabled={!canSetShareWarning}>
                    Clear reports
                  </button>
                </div>
                {!canSetShareWarning ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    “Warn” and “Clear” require the newer sharing schema columns on <code>share_links</code>. You can still Block/Unblock.
                  </div>
                ) : null}
              </form>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
