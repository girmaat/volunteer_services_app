import MetricsPanel from "./MetricsPanel";
import Link from "next/link";
import { backendFetch, getCurrentUser } from "../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type DashboardResponse = {
  generated_at: string;
  counts: Record<string, any>;
  recent_users: Array<{ id: string; email: string; created_at: string }>;
  recent_reports: Array<{ source?: string; id: string; category: string; status: string; created_at: string; reporter_email: string; target_email: string | null }>;
};

type DbStatusResponse = {
  run_migrations: boolean;
  db_user: string | null;
  session_user: string | null;
  database: string | null;
  expected_owner: string | null;
  owner_mismatches: Array<{ tablename: string; tableowner: string }>;
};

type PlatformSettingsResponse = {
  maintenance: {
    enabled: boolean;
    message: string | null;
    updated_at: string;
    updated_by_user_id: string | null;
  };
};

type FetchOk<T> = { ok: true; data: T };
type FetchErr = { ok: false; status: number; message: string };
type FetchResult<T> = FetchOk<T> | FetchErr;

async function fetchJson<T>(path: string): Promise<FetchResult<T>> {
  const res = await backendFetch(path, { method: "GET" });

  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: res.status, message: "forbidden" };
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j: any = await res.json();
      if (j?.message) msg = String(j.message);
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, message: msg };
  }

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 500, message: "Invalid JSON response" };
  }
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="adminCard">
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>{String(value ?? "—")}</div>
    </div>
  );
}

export default async function Page(props: { searchParams?: Promise<{ ok?: string; error?: string }> }) {
  const viewer = await getCurrentUser();
  if (viewer && !viewer.is_platform_admin) redirect("/admin/moderation");
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const settingsR = await fetchJson<PlatformSettingsResponse>("/v1/admin/platform/settings");
  const dbR = await fetchJson<DbStatusResponse>("/v1/admin/system/db-status");
  const dashR = await fetchJson<DashboardResponse>("/v1/admin/dashboard");

  const forbidden = [settingsR, dbR, dashR].some((r) => !r.ok && (r.status === 401 || r.status === 403));
  if (forbidden) redirect("/403");

  const loadErrors: string[] = [];
  if (!settingsR.ok) loadErrors.push(`Platform settings (${settingsR.status})`);
  if (!dbR.ok) loadErrors.push(`DB status (${dbR.status})`);
  if (!dashR.ok) loadErrors.push(`Dashboard (${dashR.status})`);

  const settings: PlatformSettingsResponse = settingsR.ok
    ? settingsR.data
    : { maintenance: { enabled: false, message: null, updated_at: new Date().toISOString(), updated_by_user_id: null } };

  const dbStatus: DbStatusResponse = dbR.ok
    ? dbR.data
    : { run_migrations: false, db_user: null, session_user: null, database: null, expected_owner: null, owner_mismatches: [] };

  const dash: DashboardResponse = dashR.ok
    ? dashR.data
    : { generated_at: new Date().toISOString(), counts: {}, recent_users: [], recent_reports: [] };

  const c = dash.counts || {};
  const maintenanceFormDisabled = !settingsR.ok;

  return (
    <div className="adminGrid">
      <header>
        <h1 style={{ margin: 0 }}>Admin dashboard</h1>
        <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>Platform health + moderation queues.</p>
      </header>

      {loadErrors.length ? (
        <div className="adminCard" style={{ border: "1px solid rgba(220, 53, 69, .35)" }}>
          <div style={{ fontWeight: 900 }}>Admin data unavailable</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Some admin endpoints failed to load: {loadErrors.join(", ")}. This page is still usable, but data may be incomplete.
          </div>
        </div>
      ) : null}

      <div className="adminCard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 10 }}>
              Maintenance mode
              {settings.maintenance.enabled ? (
                <span className="badge badgeBad">Enabled</span>
              ) : (
                <span className="badge badgeOk">Disabled</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              When enabled, all non-admin users are redirected to <code>/maintenance</code>.
              {settings.maintenance.updated_at ? ` Last updated: ${new Date(settings.maintenance.updated_at).toLocaleString()}.` : ""}
            </div>
          </div>

          {searchParams?.ok === "maintenance" ? <span className="badge badgeOk">Saved</span> : null}
          {searchParams?.error ? <span className="badge badgeBad">{searchParams.error}</span> : null}
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            const enabled = formData.get("enabled") === "on";
            const message = String(formData.get("message") || "").trim();

            const res = await backendFetch("/v1/admin/platform/settings/maintenance", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ enabled, message: message.length ? message : null })
            });

            if (!res.ok) {
              redirect(`/admin?error=${encodeURIComponent("Failed to save")}`);
            }
            revalidatePath("/admin");
            redirect("/admin?ok=maintenance");
          }}
          style={{ marginTop: 12, display: "grid", gap: 10 }}
        >
          <fieldset disabled={maintenanceFormDisabled} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 10 }}>
            <label className="switchRow">
              <input type="checkbox" name="enabled" aria-label="Enabled" defaultChecked={settings.maintenance.enabled} />
              <span>
                <div style={{ fontWeight: 800 }}>Enable maintenance mode</div>
                <div className="muted" style={{ fontSize: 12 }}>Redirect visitors to a maintenance notice.</div>
              </span>
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Maintenance message (optional)</div>
              <textarea
                className="textarea"
                name="message" aria-label="Message"
                rows={3}
                placeholder="Example: We’re upgrading the platform. Please check back soon."
                defaultValue={settings.maintenance.message || ""}
              />
            </div>

            <div className="adminActions">
              <button className="btn" type="submit">Save</button>
              {settings.maintenance.enabled ? (
                <button className="btn btnSoft" type="submit" formAction={async () => {
                  "use server";
                  const res = await backendFetch("/v1/admin/platform/settings/maintenance", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ enabled: false, message: null })
                  });
                  if (!res.ok) redirect(`/admin?error=${encodeURIComponent("Failed to disable")}`);
                  revalidatePath("/admin");
                  redirect("/admin?ok=maintenance");
                }}>Disable now</button>
              ) : null}
              {maintenanceFormDisabled ? (
                <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Maintenance controls unavailable until platform settings load.</span>
              ) : null}
            </div>
          </fieldset>
        </form>
      </div>

      <div className="adminCard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 10 }}>
              Database &amp; migrations
              {dbStatus.owner_mismatches?.length ? (
                <span className="badge badgeBad">Ownership mismatch</span>
              ) : (
                <span className="badge badgeOk">OK</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Runtime DB user: <code>{dbStatus.db_user || "—"}</code>. Startup migrations:{" "}
              {dbStatus.run_migrations ? <span className="badge badgeBad">Enabled</span> : <span className="badge badgeOk">Disabled</span>}.
              {dbStatus.expected_owner ? (
                <> Expected owner: <code>{dbStatus.expected_owner}</code>.</>
              ) : null}
            </div>
          </div>
          <a className="btn btnSoft" href="/admin/users">Manage admins</a>
        </div>

        {dbStatus.owner_mismatches?.length ? (
          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
              The backend role can’t run schema updates unless it owns the tables. Fix by reassigning ownership to the schema owner (see backend/scripts/db/README.md).
            </div>
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {dbStatus.owner_mismatches.map((m) => (
                  <tr key={m.tablename}>
                    <td><code>{m.tablename}</code></td>
                    <td><code>{m.tableowner}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <MetricsPanel />

      <div className="adminStats">
        <Stat label="Users" value={c.users_total} />
        <Stat label="New users (7d)" value={c.users_new_7d} />
        <Stat label="Organizations" value={c.orgs_total} />
        <Stat label="Requests (open)" value={`${c.requests_open ?? 0} / ${c.requests_total ?? 0}`} />
        <Stat label="Reports open" value={c.reports_open} />
        <Stat label="Incidents open" value={c.incidents_open} />
      </div>

      <div className="adminStats">
        <Stat label="Org verification queue" value={c.org_verification_queue} />
        <Stat label="User verification queue" value={c.user_verification_queue} />
        <Stat label="Banned users" value={c.banned_users} />
      </div>

      <div className="adminCard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 900 }}>Recent users</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Last 8 signups</div>
          </div>
          <a className="btn" href="/admin/users">Open users</a>
        </div>

        <div style={{ marginTop: 10 }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Email</th>
                <th className="muted" style={{ fontSize: 12 }}>Created</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {dash.recent_users?.map((u) => (
                <tr key={u.id}>
                  <td><code>{u.email}</code></td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(u.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {!dash.recent_users?.length ? (
                <tr><td colSpan={2} className="muted" style={{ fontSize: 12 }}>No recent users.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="adminCard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 900 }}>Recent reports</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Last 8 reports</div>
          </div>
          <Link className="btn" href="/admin/reports">Open reports</Link>
        </div>

        <div style={{ marginTop: 10 }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Source</th>
                <th>Status</th>
                <th className="muted" style={{ fontSize: 12 }}>Created</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {dash.recent_reports?.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.category}</code></td>
                  <td><span className="badge">{r.source === "share_report" ? "Share link" : "In-app"}</span></td>
                  <td><span className={`badge ${r.status === "submitted" ? "badgeWarn" : r.status === "in_review" ? "badgeWarn" : r.status === "resolved" ? "badgeOk" : "badge"}`}>{r.status}</span></td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <a
                      className="btn"
                      href={`/admin/reports/${encodeURIComponent(r.id)}`}
                      style={{ padding: '0.32rem 0.55rem', borderRadius: 999, fontSize: 12 }}
                    >
                      Details
                    </a>
                  </td>
                </tr>
              ))}
              {!dash.recent_reports?.length ? (
                <tr><td colSpan={5} className="muted" style={{ fontSize: 12 }}>No recent reports.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Generated at: {new Date(dash.generated_at).toLocaleString()}
      </div>
    </div>
  );
}
