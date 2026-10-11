import { inOrg } from "../../../lib/access";
import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";
import styles from "../org.module.css";

export const dynamic = "force-dynamic";

type OrgRequest = { id: string; title: string };

type ImpactReport = {
  range?: { from?: string | null; to?: string | null };
  requests?: { total: number; open: number; paused: number; closed: number };
  applications?: {
    total: number;
    pending: number;
    accepted: number;
    waitlisted: number;
    rejected: number;
    withdrawn: number;
    confirmed: number;
    completed: number;
  };
  outcomes?: {
    completed_engagements: number;
    unique_volunteers: number;
    open_checkins: number;
    closed_sessions: number;
    total_hours: number;
  };
  top_opportunities_by_hours?: { request_id: string; request_title: string; total_hours: number; sessions: number }[];
};

type VolunteerHoursRow = {
  volunteer_user_id: string;
  volunteer_email: string | null;
  volunteer_display_name: string | null;
  open_sessions: number;
  closed_sessions: number;
  total_hours: number;
  last_activity_at: string | null;
};

type VolunteerHoursReport = {
  range?: { from?: string | null; to?: string | null };
  request_id?: string | null;
  total_hours?: number;
  volunteers?: VolunteerHoursRow[];
};

async function loadRequests(): Promise<OrgRequest[]> {
  const res = await backendFetch(`/v1/org/requests`, { method: "GET" });
  if (!res.ok) return [];
  const json = (await res.json()) as { requests?: OrgRequest[] };
  return Array.isArray(json.requests) ? json.requests : [];
}

function buildRangeQs(searchParams: Record<string, string | string[] | undefined>) {
  const from = typeof searchParams.from === "string" ? searchParams.from : "";
  const to = typeof searchParams.to === "string" ? searchParams.to : "";
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  return { from, to, qs };
}

async function loadImpact(searchParams: Record<string, string | string[] | undefined>): Promise<ImpactReport> {
  const { qs } = buildRangeQs(searchParams);
  const res = await backendFetch(`/v1/org/reports/impact?${qs.toString()}`, { method: "GET" });
  if (!res.ok) return {};
  return (await res.json()) as ImpactReport;
}

async function loadVolunteerHours(searchParams: Record<string, string | string[] | undefined>): Promise<VolunteerHoursReport> {
  const { qs } = buildRangeQs(searchParams);
  const requestId = typeof searchParams.requestId === "string" ? searchParams.requestId : "";
  if (requestId) qs.set("requestId", requestId);
  const res = await backendFetch(`/v1/org/reports/volunteer-hours?${qs.toString()}`, { method: "GET" });
  if (!res.ok) return {};
  return (await res.json()) as VolunteerHoursReport;
}

function num(n: unknown) {
  const v = typeof n === "number" ? n : Number(n || 0);
  if (Number.isNaN(v)) return 0;
  return v;
}

function fmt(n: unknown) {
  const v = num(n);
  return (Math.round(v * 100) / 100).toString();
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

  const [{ from, to, qs }, requests, impact, hours] = await Promise.all([
    Promise.resolve(buildRangeQs(searchParams)),
    loadRequests(),
    loadImpact(searchParams),
    loadVolunteerHours(searchParams)
  ]);

  const requestId = typeof searchParams.requestId === "string" ? searchParams.requestId : "";
  const exportQs = new URLSearchParams(qs.toString());
  if (requestId) exportQs.set("requestId", requestId);

  const impactCsv = `/org/reports/export?type=impact&format=csv&${exportQs.toString()}`;
  const impactPdf = `/org/reports/export?type=impact&format=pdf&${exportQs.toString()}`;
  const hoursCsv = `/org/reports/export?type=volunteer_hours&format=csv&${exportQs.toString()}`;
  const hoursPdf = `/org/reports/export?type=volunteer_hours&format=pdf&${exportQs.toString()}`;

  const top = Array.isArray(impact.top_opportunities_by_hours) ? impact.top_opportunities_by_hours : [];
  const volunteers = Array.isArray(hours.volunteers) ? hours.volunteers : [];

  return (
    <div className={styles.mainFull}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h1 className="m-0">Reports</h1>
        <div className="flex gap-3 items-baseline flex-wrap">
          <Link prefetch={false} className={styles.smallLink} href={impactCsv}>
            Impact CSV
          </Link>
          <Link prefetch={false} className={styles.smallLink} href={impactPdf}>
            Impact PDF
          </Link>
          <Link prefetch={false} className={styles.smallLink} href={hoursCsv}>
            Volunteer hours CSV
          </Link>
          <Link prefetch={false} className={styles.smallLink} href={hoursPdf}>
            Volunteer hours PDF
          </Link>
        </div>
      </div>

      <form className={`${styles.card} mt-3 grid grid-cols-[1fr_1fr_1fr_auto] gap-2.5 items-end`}>
        <div>
          <label className={styles.label}>From</label>
          <input className={styles.input} type="date" name="from" defaultValue={from} />
        </div>

        <div>
          <label className={styles.label}>To</label>
          <input className={styles.input} type="date" name="to" defaultValue={to} />
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
          <div className={styles.help}>For volunteer-hours filtering + exports.</div>
        </div>

        <div>
          <button className={styles.primaryButton} type="submit">
            Apply
          </button>
        </div>
      </form>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 mt-3">
        <div className={styles.card}>
          <div className={styles.meta}>Requests</div>
          <div className="text-2xl font-bold">{num(impact.requests?.total)}</div>
          <div className={styles.meta}>
            Open: {num(impact.requests?.open)} · Paused: {num(impact.requests?.paused)} · Closed: {num(impact.requests?.closed)}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.meta}>Applications</div>
          <div className="text-2xl font-bold">{num(impact.applications?.total)}</div>
          <div className={styles.meta}>
            Pending: {num(impact.applications?.pending)} · Accepted: {num(impact.applications?.accepted)} · Waitlisted:{" "}
            {num(impact.applications?.waitlisted)} · Confirmed: {num(impact.applications?.confirmed)} · Completed:{" "}
            {num(impact.applications?.completed)}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.meta}>Outcomes (from attendance logs)</div>
          <div className="text-2xl font-bold">{fmt(impact.outcomes?.total_hours)} hrs</div>
          <div className={styles.meta}>
            Unique volunteers: {num(impact.outcomes?.unique_volunteers)} · Completed engagements: {num(impact.outcomes?.completed_engagements)}
          </div>
          <div className={styles.meta}>
            Open check-ins: {num(impact.outcomes?.open_checkins)} · Closed sessions: {num(impact.outcomes?.closed_sessions)} ·{" "}
            <Link prefetch={false} className={styles.smallLink} href="/org/attendance">
              Manage attendance
            </Link>
          </div>
        </div>
      </div>

      <div className={`${styles.card} mt-3`}>
        <h2 className="mt-0">Top opportunities by hours</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Request</th>
              <th>Sessions</th>
              <th>Total hours</th>
            </tr>
          </thead>
          <tbody>
            {top.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.muted}>
                  No attendance data for this range.
                </td>
              </tr>
            ) : (
              top.map((r) => (
                <tr key={r.request_id}>
                  <td>
                    <Link prefetch={false} className={styles.smallLink} href={`/org/requests/${r.request_id}`}>
                      {r.request_title}
                    </Link>
                  </td>
                  <td>{num(r.sessions)}</td>
                  <td>{fmt(r.total_hours)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={`${styles.card} mt-3`}>
        <h2 className="mt-0">Volunteer hours summary</h2>
        <div className={`${styles.meta} mb-2`}>
          Total hours in range: {fmt(hours.total_hours)}
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Volunteer</th>
              <th>Email</th>
              <th>Closed sessions</th>
              <th>Open sessions</th>
              <th>Total hours</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {volunteers.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  No volunteer hours found for this range.
                </td>
              </tr>
            ) : (
              volunteers.map((v) => (
                <tr key={v.volunteer_user_id}>
                  <td>{v.volunteer_display_name || v.volunteer_user_id.slice(0, 8)}</td>
                  <td>{v.volunteer_email || "—"}</td>
                  <td>{num(v.closed_sessions)}</td>
                  <td>{num(v.open_sessions)}</td>
                  <td>{fmt(v.total_hours)}</td>
                  <td>{v.last_activity_at ? new Date(v.last_activity_at).toLocaleString() : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
