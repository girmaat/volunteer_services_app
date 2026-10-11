import { inOrg } from "../../../lib/access";
import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";
import styles from "../org.module.css";

export const dynamic = "force-dynamic";

type RosterRow = {
  volunteer_user_id: string;
  volunteer_email: string;
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
  active_count: number;
  waitlisted_count: number;
  completed_count: number;
  total_count: number;
  last_activity_at: string | null;
  request_titles: string[] | null;
};

async function load(filters: { status?: string; requestId?: string; search?: string }): Promise<{ roster: RosterRow[] }> {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.requestId) qs.set("requestId", filters.requestId);
  if (filters.search) qs.set("search", filters.search);

  const res = await backendFetch(`/v1/org/roster?${qs.toString()}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load roster");
  return (await res.json()) as { roster: RosterRow[] };
}

export default async function OrgRosterPage(
  props: {
    searchParams?: Promise<{ status?: string; requestId?: string; search?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!inOrg(user)) redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const status = searchParams?.status || "active";
  const requestId = searchParams?.requestId || "";
  const search = searchParams?.search || "";

  const data = await load({ status, requestId: requestId || undefined, search: search || undefined });
  const rows = data.roster || [];

  const exportQs = new URLSearchParams();
  exportQs.set("status", status);
  if (requestId) exportQs.set("requestId", requestId);
  if (search) exportQs.set("search", search);

  return (
    <div className={styles.mainFull}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1>Volunteer roster</h1>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link className={styles.badge} href={`/org/roster/export?${exportQs.toString()}`}>
            Export CSV
          </Link>
          <Link className={styles.badge} href="/org/applications">
            View applications
          </Link>
        </div>
      </div>

      <form method="GET" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 12, marginBottom: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Status</span>
          <select name="status" defaultValue={status}>
            <option value="active">Active (accepted/confirmed)</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 4, minWidth: 180 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Search</span>
          <input name="search" defaultValue={search} placeholder="Name or email" />
        </label>

        <label style={{ display: "grid", gap: 4, minWidth: 240 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Request ID (optional)</span>
          <input name="requestId" defaultValue={requestId} placeholder="UUID" />
        </label>

        <button className={styles.badge} type="submit">
          Apply
        </button>

        <Link className={styles.badge} href="/org/roster">
          Reset
        </Link>
      </form>

      {rows.length === 0 ? (
        <p>No volunteers match these filters.</p>
      ) : (
        <ul style={{ display: "grid", gap: 10, paddingLeft: 18 }}>
          {rows.map((r) => {
            const name = r.volunteer_display_name || r.volunteer_email;
            const titles = (r.request_titles || []).slice(0, 3);
            return (
              <li key={r.volunteer_user_id} style={{ padding: 10, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div>
                    <strong>{name}</strong>{" "}
                    <span style={{ opacity: 0.75 }}>
                      · {r.active_count} active · {r.waitlisted_count} waitlisted · {r.completed_count} completed
                    </span>
                    {r.volunteer_public_location ? (
                      <div style={{ marginTop: 4, opacity: 0.75 }}>{r.volunteer_public_location}</div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link className={styles.badge} href={`/inbox`}>
                      Message
                    </Link>
                                      </div>
                </div>

                {titles.length > 0 ? (
                  <div style={{ marginTop: 8, opacity: 0.8 }}>
                    Recent requests: {titles.join(" · ")}
                    {(r.request_titles || []).length > titles.length ? " …" : ""}
                  </div>
                ) : null}

                {r.last_activity_at ? (
                  <div style={{ marginTop: 8, opacity: 0.75 }}>Last activity: {new Date(r.last_activity_at).toLocaleString()}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
