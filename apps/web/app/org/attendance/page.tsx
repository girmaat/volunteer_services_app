import { inOrg } from "../../../lib/access";
import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";
import styles from "../org.module.css";

export const dynamic = "force-dynamic";

type OrgRequest = { id: string; title: string };
type AttendanceRow = {
  id: string;
  request_id: string;
  request_title: string;
  volunteer_user_id: string;
  volunteer_email: string | null;
  volunteer_display_name: string | null;
  check_in_at: string;
  check_out_at: string | null;
  hours: number | null;
  notes: string | null;
};

async function loadRequests(): Promise<OrgRequest[]> {
  const res = await backendFetch(`/v1/org/requests`, { method: "GET" });
  if (!res.ok) return [];
  const json = (await res.json()) as { requests?: OrgRequest[] };
  return Array.isArray(json.requests) ? json.requests : [];
}

async function loadAttendance(searchParams: Record<string, string | string[] | undefined>): Promise<AttendanceRow[]> {
  const qs = new URLSearchParams();
  const requestId = typeof searchParams.requestId === "string" ? searchParams.requestId : "";
  const volunteerUserId = typeof searchParams.volunteerUserId === "string" ? searchParams.volunteerUserId : "";
  const status = typeof searchParams.status === "string" ? searchParams.status : "all";
  const from = typeof searchParams.from === "string" ? searchParams.from : "";
  const to = typeof searchParams.to === "string" ? searchParams.to : "";

  if (requestId) qs.set("requestId", requestId);
  if (volunteerUserId) qs.set("volunteerUserId", volunteerUserId);
  if (status) qs.set("status", status);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  const res = await backendFetch(`/v1/org/attendance?${qs.toString()}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load attendance");
  const json = (await res.json()) as { attendance?: AttendanceRow[] };
  return Array.isArray(json.attendance) ? json.attendance : [];
}

function sumHours(rows: AttendanceRow[]) {
  let total = 0;
  for (const r of rows) total += typeof r.hours === "number" ? r.hours : 0;
  return Math.round(total * 100) / 100;
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
  // Volunteers' contact details and attendance are for admins and managers.
  if (ctx.membership.role === "member") redirect("/org/documents");

  const [requests, rows] = await Promise.all([loadRequests(), loadAttendance(searchParams)]);

  const requestId = typeof searchParams.requestId === "string" ? searchParams.requestId : "";
  const volunteerUserId = typeof searchParams.volunteerUserId === "string" ? searchParams.volunteerUserId : "";
  const status = typeof searchParams.status === "string" ? searchParams.status : "all";
  const from = typeof searchParams.from === "string" ? searchParams.from : "";
  const to = typeof searchParams.to === "string" ? searchParams.to : "";

  const exportQs = new URLSearchParams();
  if (requestId) exportQs.set("requestId", requestId);
  if (volunteerUserId) exportQs.set("volunteerUserId", volunteerUserId);
  if (status) exportQs.set("status", status);
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);

  const openCount = rows.filter((r) => !r.check_out_at).length;
  const totalHours = sumHours(rows);

  return (
    <div className={styles.mainFull}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h1 className="m-0">Attendance</h1>
        <div className="flex gap-3 items-baseline">
          <span className={styles.meta}>Open check-ins: {openCount}</span>
          <span className={styles.meta}>Total hours: {totalHours}</span>
          <Link prefetch={false} className={styles.smallLink} href={`/org/attendance/export?${exportQs.toString()}`}>
            Export CSV
          </Link>
        </div>
      </div>

      <form className={`${styles.card} mt-3 grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-2.5 items-end`}>
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
          <label className={styles.label}>Volunteer User ID</label>
          <input className={styles.input} name="volunteerUserId" defaultValue={volunteerUserId} placeholder="UUID" />
        </div>

        <div>
          <label className={styles.label}>Status</label>
          <select className={styles.select} name="status" defaultValue={status}>
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div>
          <label className={styles.label}>From</label>
          <input className={styles.input} type="date" name="from" defaultValue={from} />
        </div>

        <div>
          <label className={styles.label}>To</label>
          <input className={styles.input} type="date" name="to" defaultValue={to} />
        </div>

        <div>
          <button className={styles.primaryButton} type="submit">
            Apply
          </button>
        </div>
      </form>

      <div className={`${styles.card} mt-3`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Request</th>
              <th>Volunteer</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Hours</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  No attendance records.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link prefetch={false} href={`/org/requests/${r.request_id}`}>{r.request_title}</Link>
                  </td>
                  <td>
                    <div className="flex flex-col">
                      <span>{r.volunteer_display_name || r.volunteer_email || r.volunteer_user_id}</span>
                      <span className={`${styles.muted} text-xs`}>
                        {r.volunteer_user_id}
                      </span>
                    </div>
                  </td>
                  <td>{new Date(r.check_in_at).toLocaleString()}</td>
                  <td>{r.check_out_at ? new Date(r.check_out_at).toLocaleString() : <span className={styles.badge}>OPEN</span>}</td>
                  <td>{typeof r.hours === "number" ? r.hours.toFixed(2) : ""}</td>
                  <td className="max-w-[320px]">{r.notes || ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
