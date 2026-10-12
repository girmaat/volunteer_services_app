import { inOrg } from "../../../lib/access";
import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";
import styles from "../org.module.css";

export const dynamic = "force-dynamic";

type RosterRow = {
  volunteer_user_id: string;
  volunteer_email: string | null;
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
  // Volunteers' contact details and attendance are for admins and managers.
  if (ctx.membership.role === "member") redirect("/org/documents");

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
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h1>Volunteer roster</h1>
        <div className="flex gap-3 flex-wrap">
          <Link prefetch={false} className={styles.badge} href={`/org/roster/export?${exportQs.toString()}`}>
            Export CSV
          </Link>
          <Link prefetch={false} className={styles.badge} href="/org/applications">
            View applications
          </Link>
        </div>
      </div>

      <form className="flex gap-2.5 items-end flex-wrap mt-3 mb-3" method="GET">
        <label className="grid gap-1">
          <span className="text-xs opacity-75">Status</span>
          <select name="status" defaultValue={status}>
            <option value="active">Active (accepted/confirmed)</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>
        </label>

        <label className="grid gap-1 min-w-[180px]">
          <span className="text-xs opacity-75">Search</span>
          <input name="search" defaultValue={search} placeholder="Name or email" />
        </label>

        <label className="grid gap-1 min-w-[240px]">
          <span className="text-xs opacity-75">Request ID (optional)</span>
          <input name="requestId" defaultValue={requestId} placeholder="UUID" />
        </label>

        <button className={styles.badge} type="submit">
          Apply
        </button>

        <Link prefetch={false} className={styles.badge} href="/org/roster">
          Reset
        </Link>
      </form>

      {rows.length === 0 ? (
        <p>No volunteers match these filters.</p>
      ) : (
        <ul className="grid gap-2.5 pl-4">
          {rows.map((r) => {
            const name = r.volunteer_display_name || r.volunteer_email || "Volunteer";
            const titles = (r.request_titles || []).slice(0, 3);
            return (
              <li className="p-2.5 border border-line rounded-md" key={r.volunteer_user_id}>
                <div className="flex justify-between gap-3 items-baseline flex-wrap">
                  <div>
                    <strong>{name}</strong>{" "}
                    <span className="opacity-75">
                      · {r.active_count} active · {r.waitlisted_count} waitlisted · {r.completed_count} completed
                    </span>
                    {r.volunteer_public_location ? (
                      <div className="mt-1 opacity-75">{r.volunteer_public_location}</div>
                    ) : null}
                  </div>

                  <div className="flex gap-2.5 flex-wrap">
                    <Link prefetch={false} className={styles.badge} href={`/inbox`}>
                      Message
                    </Link>
                                      </div>
                </div>

                {titles.length > 0 ? (
                  <div className="mt-2 opacity-80">
                    Recent requests: {titles.join(" · ")}
                    {(r.request_titles || []).length > titles.length ? " …" : ""}
                  </div>
                ) : null}

                {r.last_activity_at ? (
                  <div className="mt-2 opacity-75">Last activity: {new Date(r.last_activity_at).toLocaleString()}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
