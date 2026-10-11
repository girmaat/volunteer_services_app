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
      <header className="flex justify-between items-baseline gap-3 flex-wrap">
        <div>
          <h1 className="m-0">Report details</h1>
          <p className="muted mt-1.5 mb-0">Review the report, update status, and apply moderation actions.</p>
        </div>
        <Link className="btn" href="/admin/reports">Back to reports</Link>
      </header>

      {loaded.error ? (
        <div className="adminCard border border-danger">
          <div className="font-black">Could not load report</div>
          <div className="muted text-xs mt-1.5">{loaded.error}</div>
        </div>
      ) : null}

      {error ? (
        <div className="adminCard border border-danger">
          <div className="font-black">Action failed</div>
          <div className="muted text-xs mt-1.5">{error}</div>
        </div>
      ) : null}

      {ok ? (
        <div className="adminCard border border-success">
          <div className="font-black">Saved</div>
          <div className="muted text-xs mt-1.5">Your changes were applied.</div>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="adminCard">
            <div className="flex justify-between gap-3 flex-wrap">
              <div>
                <div className="flex gap-2 flex-wrap items-center">
                  {sourceBadge(report.source)}
                  {statusBadge(report.status)}
                  {report.source === "share_report" ? linkStateBadge(report) : null}
                </div>
                <div className="font-black mt-2.5"><code>{report.category}</code></div>
                <div className="muted text-xs mt-1.5">Created: {new Date(report.created_at).toLocaleString()}</div>
              </div>
              <div className="min-w-[280px] max-w-[520px] flex-1">
                <div className="muted text-xs">Reporter</div>
                <div className="font-bold mt-1"><code>{report.reporter_email}</code></div>
                <div className="muted text-xs mt-2.5">Target</div>
                <div className="font-bold mt-1"><code>{report.target_email || "—"}</code></div>
                {report.target_request_title ? (
                  <div className="muted text-xs mt-1.5">Context: {report.target_request_title}</div>
                ) : null}
              </div>
            </div>

            <div className="mt-3.5">
              <div className="muted text-xs">Report details</div>
              <div className="mt-1.5 whitespace-pre-wrap">{report.details || <span className="muted">(none)</span>}</div>
            </div>

            {report.source === "share_report" ? (
              <div className="mt-3.5">
                <div className="muted text-xs">Share link</div>
                <div className="grid gap-1.5 mt-1.5">
                  <div><span className="muted text-xs">Token:</span> <code>{report.share_token || "—"}</code></div>
                  <div><span className="muted text-xs">Destination:</span> <code>{report.share_destination_path || "—"}</code></div>
                  <div><span className="muted text-xs">Type:</span> <code>{report.share_type || "—"}</code></div>
                  <div><span className="muted text-xs">Reports:</span> <strong>{Number(report.share_report_count || 0)}</strong> (distinct 24h: <strong>{Number(report.share_distinct_24h || 0)}</strong>)</div>
                </div>
              </div>
            ) : null}
          </div>

	          {report.source === "share_report" && !canUpdateShareReport ? (
	            <div className="adminCard border border-warning">
	              <div className="font-black">Update status</div>
	              <div className="muted text-xs mt-2">
	                This environment can <strong>view</strong> share-link reports, but can’t update their status/notes because your database
	                hasn’t applied the sharing moderation columns yet.
	              </div>
	              <div className="mt-2.5 grid gap-1.5">
	                <div className="muted text-xs">
	                  To enable status updates, run the sharing schema upgrade as the DB owner:
	                </div>
	                <div className="muted text-xs">
	                  <code>backend/scripts/db/apply_sharing_schema.sql</code>
	                </div>
	                <div className="muted text-xs">
	                  Or set <code>RUN_MIGRATIONS=1</code> and restart the backend.
	                </div>
	              </div>
	              <div className="flex gap-2.5 flex-wrap items-center mt-3">
	                <Link className="btn" href="/admin/reports">Back to queue</Link>
	              </div>
	            </div>
	          ) : (
	            <div className="adminCard">
	              <div className="font-black">Update status</div>
	              <form className="mt-2.5 grid gap-2.5" action={updateReport}>
	                <label className="grid gap-1.5">
	                  <span className="muted text-xs">Status</span>
	                  <select name="status" aria-label="Status" defaultValue={report.status || "submitted"} className="input">
	                    <option value="submitted">submitted</option>
	                    <option value="in_review">in_review</option>
	                    <option value="resolved">resolved</option>
	                    <option value="dismissed">dismissed</option>
	                  </select>
	                </label>

	                <label className="grid gap-1.5">
	                  <span className="muted text-xs">Admin notes</span>
	                  <textarea name="admin_notes" aria-label="Admin notes" defaultValue={report.admin_notes || ""} className="textarea" rows={4} placeholder="Notes for other moderators (not visible to users)" />
	                </label>

	                <div className="flex gap-2.5 flex-wrap items-center">
	                  <button className="btn btnSoft" type="submit">Save</button>
	                  <Link className="btn" href="/admin/reports">Back to queue</Link>
	                </div>
	              </form>
	            </div>
	          )}

          {report.target_user_id ? (
            <div className="adminCard">
              <div className="font-black">User enforcement</div>
              <div className="muted text-xs mt-1.5">
                These actions affect the user who created the reported content (share link owner or in-app target).
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 mt-3">
                <form action={strikeUser} className="adminCard p-3">
                  <input type="hidden" name="user_id" value={report.target_user_id} />
                  <div className="font-extrabold">Strike user</div>
                  <div className="muted text-xs mt-1">Adds a strike and displays a warning on their profile.</div>
                  <label className="grid gap-1.5 mt-2.5">
                    <span className="muted text-xs">Reason</span>
                    <input name="reason" aria-label="Reason" className="input" defaultValue="Report violation" />
                  </label>
                  <button className="btn btnSoft mt-2.5" type="submit">Apply strike</button>
                </form>

                <form action={banUser} className="adminCard p-3">
                  <input type="hidden" name="user_id" value={report.target_user_id} />
                  <div className="font-extrabold">Temporary ban</div>
                  <div className="muted text-xs mt-1">Prevents sign-in until the ban expires.</div>
                  <div className="flex gap-2 mt-2.5 flex-wrap">
                    <label className="grid gap-1.5 flex-1 min-w-[120px]">
                      <span className="muted text-xs">Days</span>
                      <input name="days" aria-label="Days" className="input" type="number" min={1} max={365} defaultValue={7} />
                    </label>
                    <label className="grid gap-1.5 flex-[2] min-w-[160px]">
                      <span className="muted text-xs">Reason</span>
                      <input name="reason" aria-label="Reason" className="input" defaultValue="Report violation" />
                    </label>
                  </div>
                  <button className="btn btnDanger mt-2.5" type="submit">Ban user</button>
                </form>
              </div>
            </div>
          ) : null}

          {report.source === "share_report" ? (
            <div className="adminCard">
              <div className="font-black">Share-link moderation</div>
              <div className="muted text-xs mt-1.5">
                Policy: 1) first report → warn the owner, 2) repeated or high-signal reports → block the link, 3) unblock/clear when resolved.
              </div>

              <form className="mt-3 grid gap-2.5" action={moderateShareLink}>
                <label className="grid gap-1.5">
                  <span className="muted text-xs">Moderator notes</span>
                  <textarea name="admin_notes" aria-label="Admin notes" className="textarea" rows={3} placeholder="Optional notes (stored with the report)" />
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
                  <div className="muted text-xs mt-1.5">
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
