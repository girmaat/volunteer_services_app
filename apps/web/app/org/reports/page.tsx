import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { inOrg } from "../../../lib/access";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import OrgTabs from "../../../components/org/OrgTabs";
import { ButtonLink, Card, EmptyState, Notice, PageHeader, StatStrip, StatusPill } from "../../../components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

type Impact = {
  hours: {
    approved: number;
    waiting: number;
    declined: number;
    approved_entries: number;
    waiting_entries: number;
    declined_entries: number;
    adjusted_entries: number;
    volunteers: number;
    oldest_waiting_at: string | null;
  };
  units: { unit: string; approved: number; waiting: number }[];
  approval_delay: { decided: number; median_hours: number | null; average_hours: number | null };
  requests: { published: number; open: number; filled: number; paused: number; completed: number; drafts: number };
  applications: {
    total: number;
    waiting: number;
    accepted: number;
    completed: number;
    attended: number;
    closed: number;
  };
  open_checkins: number;
  per_request_total?: number;
  per_request: {
    request_id: string;
    request_title: string;
    status: string;
    target: number | null;
    unit: string | null;
    promised: number | null;
    approved_in_unit: number | null;
    waiting_in_unit: number | null;
    approved_hours: number;
    waiting_hours: number;
    volunteers_accepted: number;
    volunteers_approved: number;
  }[];
};
type Volunteers = {
  volunteers_total?: number;
  approved_hours: number;
  waiting_hours: number;
  volunteers: {
    volunteer_user_id: string;
    volunteer_email: string | null;
    volunteer_display_name: string | null;
    minor: boolean;
    approved_hours: number;
    waiting_hours: number;
    declined_hours: number;
    last_activity_at: string | null;
  }[];
};

const h = (n: number | null | undefined) => `${Math.round(Number(n || 0) * 10) / 10} h`;
const n1 = (n: number | null | undefined) => Math.round(Number(n || 0) * 10) / 10;
const duration = (hours: number | null) =>
  hours == null
    ? "—"
    : hours < 1
      ? "under 1 h"
      : hours < 48
        ? `${Math.round(hours)} h`
        : `${Math.round(hours / 24)} days`;
const field = "h-10 rounded border border-line-strong bg-surface px-3 text-sm";

/**
 * Organization reports (OPS-02/05): approved hours are the totals; waiting and not-approved hours are
 * shown next to them, never added in. Per request: goal, promised, approved and waiting in its unit.
 */
export default async function ReportsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!inOrg(user)) redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");
  if (ctx.membership.role === "member") {
    return (
      <>
        <PageHeader title="Reports" />
        <OrgTabs role="member" />
        <div className="mt-6">
          <Notice tone="info">Reports show volunteers’ names and hours, so only admins and managers can open them.</Notice>
        </div>
      </>
    );
  }

  const one = (k: string) => (typeof sp[k] === "string" ? String(sp[k]) : "");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one("from")) ? one("from") : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one("to")) ? one("to") : "";
  const requestId = /^[0-9a-f-]{36}$/i.test(one("requestId")) ? one("requestId") : "";
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (requestId) qs.set("requestId", requestId);

  const [impactRes, volRes, reqRes] = await Promise.all([
    backendFetch(`/v1/org/reports/impact?${qs}`),
    backendFetch(`/v1/org/reports/volunteer-hours?${qs}`),
    backendFetch("/v1/org/requests")
  ]);
  const impact = impactRes.ok ? ((await impactRes.json()) as Impact) : null;
  const vols = volRes.ok ? ((await volRes.json()) as Volunteers) : null;
  const requests = reqRes.ok
    ? (((await reqRes.json()) as { requests?: { id: string; title: string }[] }).requests ?? [])
    : [];
  const exp = (type: string, format: string) =>
    `/org/reports/export?type=${type}&format=${format}${qs.toString() ? `&${qs}` : ""}`;
  const staleDays = impact?.hours.oldest_waiting_at
    ? Math.floor((Date.now() - new Date(impact.hours.oldest_waiting_at).getTime()) / 86_400_000)
    : 0;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Hours count once they’re approved. Hours waiting for a decision and hours you didn’t approve are shown separately, never added in."
        actions={
          <>
            <ButtonLink
              href={exp("impact", "csv")}
              variant="secondary"
              prefetch={false}
              icon={<Download aria-hidden className="h-4 w-4" />}
            >
              Requests CSV
            </ButtonLink>
            <ButtonLink
              href={exp("volunteer_hours", "csv")}
              variant="secondary"
              prefetch={false}
              icon={<Download aria-hidden className="h-4 w-4" />}
            >
              Volunteers CSV
            </ButtonLink>
            <ButtonLink href={exp("impact", "pdf")} variant="ghost" prefetch={false}>
              Summary PDF
            </ButtonLink>
          </>
        }
      />
      <OrgTabs role={ctx.membership.role} />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium">
          From
          <input type="date" name="from" defaultValue={from} className={field} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          To
          <input type="date" name="to" defaultValue={to} className={field} />
        </label>
        <label className="grid min-w-[220px] gap-1 text-sm font-medium">
          Request
          <select name="requestId" defaultValue={requestId} className={field}>
            <option value="">All requests</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-10 cursor-pointer rounded border-0 bg-primary px-4 text-sm font-semibold text-primary-ink"
        >
          Show
        </button>
        {from || to || requestId ? (
          <Link prefetch={false} href="/org/reports" className="text-sm font-medium text-muted">
            Clear
          </Link>
        ) : null}
      </form>

      {!impact ? <Notice tone="danger">Reports couldn’t load. Refresh to try again.</Notice> : null}
      {impact ? (
        <>
          <StatStrip
            stats={[
              {
                label: "Approved hours",
                value: n1(impact.hours.approved),
                hint: `${impact.hours.volunteers} volunteer${impact.hours.volunteers === 1 ? "" : "s"}`
              },
              {
                label: "Waiting for approval",
                value: h(impact.hours.waiting),
                href: "/org/hours",
                attention: impact.hours.waiting_entries > 0,
                hint: `${impact.hours.waiting_entries} entr${impact.hours.waiting_entries === 1 ? "y" : "ies"}`
              },
              {
                label: "Not approved",
                value: h(impact.hours.declined),
                hint: `${impact.hours.adjusted_entries} approved with a change`
              },
              {
                label: "Typical time to decide",
                value: duration(impact.approval_delay.median_hours),
                hint: `median of ${impact.approval_delay.decided}`
              }
            ]}
          />
          {impact.units.length ? (
            <p className="m-0 mt-3 text-sm">
              <span className="font-medium">Other units:</span>{" "}
              {impact.units
                .map((u) => `${n1(u.approved)} ${u.unit} approved${u.waiting ? ` (${n1(u.waiting)} waiting)` : ""}`)
                .join(" · ")}
            </p>
          ) : null}
          {staleDays >= 7 ? (
            <div className="mt-4">
              <Notice tone="warning">
                Some hours have waited {staleDays} days for a decision. <Link href="/org/hours">Review them</Link> so
                volunteers’ records stay current.
              </Notice>
            </div>
          ) : null}

          <section aria-labelledby="req-h" className="mt-10">
            <h2 id="req-h" className="m-0 mb-3 text-lg">
              By request
            </h2>
            {!impact.per_request.length ? (
              <EmptyState
                title="No hours in this range"
                body="Hours appear here once volunteers check out, work is marked complete, or someone reports time."
              />
            ) : (
              <>
                {/* Phones: one block per request. */}
                <ul className="m-0 grid gap-2 p-0 sm:hidden">
                  {impact.per_request.map((r) => {
                    const unit = r.unit && r.unit !== "hours" ? ` ${r.unit}` : " h";
                    return (
                      <li
                        key={r.request_id}
                        className="list-none rounded-md border border-line bg-surface px-4 py-3 text-sm"
                      >
                        <Link prefetch={false} href={`/org/requests/${r.request_id}`} className="font-medium">
                          {r.request_title}
                        </Link>
                        <p className="m-0 mt-1">
                          <span className="font-medium">
                            {r.target != null ? `${n1(r.approved_in_unit)}${unit}` : h(r.approved_hours)} approved
                          </span>
                          {" · "}
                          {r.target != null ? `${n1(r.waiting_in_unit)}${unit}` : h(r.waiting_hours)} waiting
                        </p>
                        {r.target != null ? (
                          <p className="m-0 mt-0.5 text-muted">
                            Goal {n1(r.target)}
                            {unit} · {n1(r.promised)}
                            {unit} promised
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <Card className="hidden overflow-x-auto p-0 sm:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          Request
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          Goal
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          Promised
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          Approved
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">
                          Waiting
                        </th>
                        <th scope="col" className="px-4 py-2.5 font-semibold">
                          Volunteers
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {impact.per_request.map((r) => {
                        const unit = r.unit && r.unit !== "hours" ? ` ${r.unit}` : " h";
                        return (
                          <tr key={r.request_id} className="border-b border-line align-top last:border-b-0">
                            <td className="px-4 py-3">
                              <Link prefetch={false} href={`/org/requests/${r.request_id}`} className="font-medium">
                                {r.request_title}
                              </Link>
                              <span className="ml-2 align-middle">
                                <StatusPill kind="request" status={r.status} />
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              {r.target != null ? `${n1(r.target)}${unit}` : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              {r.promised != null ? `${n1(r.promised)}${unit}` : "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 font-medium">
                              {r.target != null ? `${n1(r.approved_in_unit)}${unit}` : h(r.approved_hours)}
                              {r.target != null && r.unit && r.unit !== "hours" && r.approved_hours ? (
                                <span className="block text-xs font-normal text-muted">
                                  {h(r.approved_hours)} of time
                                </span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">
                              {r.target != null ? `${n1(r.waiting_in_unit)}${unit}` : h(r.waiting_hours)}
                            </td>
                            <td className="px-4 py-3">
                              {r.volunteers_approved} with approved hours
                              <span className="block text-xs text-muted">{r.volunteers_accepted} accepted</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              </>
            )}
            {(impact.per_request_total ?? 0) > impact.per_request.length ? (
              <p className="m-0 mt-3 text-sm text-muted">
                Showing the top {impact.per_request.length} of {impact.per_request_total} requests.{" "}
                <a href={exp("impact", "csv")} className="font-semibold text-primary underline">
                  Download all as CSV
                </a>
              </p>
            ) : null}
          </section>

          <section aria-labelledby="flow-h" className="mt-10">
            <h2 id="flow-h" className="m-0 mb-3 text-lg">
              From posting to approved hours
            </h2>
            <ol className="m-0 grid grid-cols-2 gap-3 p-0 sm:grid-cols-5">
              {[
                [
                  "Requests published",
                  impact.requests.published,
                  `${impact.requests.open} open · ${impact.requests.filled} filled · ${impact.requests.completed} done`
                ],
                ["Applications", impact.applications.total, `${impact.applications.waiting} still waiting`],
                ["Accepted", impact.applications.accepted, `${impact.applications.closed} declined or withdrew`],
                [
                  "Checked in",
                  impact.applications.attended,
                  impact.open_checkins ? `${impact.open_checkins} checked in now` : "via staff or QR code"
                ],
                ["Completed", impact.applications.completed, `${impact.hours.approved_entries} hour entries approved`]
              ].map(([label, value, hint]) => (
                <li key={String(label)} className="list-none rounded-md border border-line bg-surface px-4 py-3">
                  <span className="block text-sm text-muted">{label}</span>
                  <span className="block font-display text-2xl font-bold">{value}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}

      <section aria-labelledby="vol-h" className="mt-10">
        <h2 id="vol-h" className="m-0 mb-3 text-lg">
          By volunteer
        </h2>
        {!vols?.volunteers.length ? (
          <EmptyState title="No volunteer hours in this range" />
        ) : (
          <>
            <ul className="m-0 grid gap-2 p-0 sm:hidden">
              {vols.volunteers.map((v) => (
                <li
                  key={v.volunteer_user_id}
                  className="list-none rounded-md border border-line bg-surface px-4 py-3 text-sm"
                >
                  <p className="m-0 flex justify-between gap-3">
                    <span className="font-medium">{v.volunteer_display_name || "Volunteer"}</span>
                    <span className="font-medium">{h(v.approved_hours)} approved</span>
                  </p>
                  <p className="m-0 mt-0.5 text-muted">
                    {v.minor ? "Under 18 · contact hidden" : v.volunteer_email || ""}
                    {v.waiting_hours ? ` · ${h(v.waiting_hours)} waiting` : ""}
                    {v.declined_hours ? ` · ${h(v.declined_hours)} not approved` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <Card className="hidden overflow-x-auto p-0 sm:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Volunteer
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Approved
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Waiting
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Not approved
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Last activity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vols.volunteers.map((v) => (
                    <tr key={v.volunteer_user_id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-3">
                        <span className="font-medium">{v.volunteer_display_name || "Volunteer"}</span>
                        <span className="block text-xs text-muted">
                          {v.minor ? "Under 18 · contact hidden" : v.volunteer_email || ""}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium">{h(v.approved_hours)}</td>
                      <td className="whitespace-nowrap px-3 py-3">{h(v.waiting_hours)}</td>
                      <td className="whitespace-nowrap px-3 py-3">{h(v.declined_hours)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {v.last_activity_at
                          ? new Date(v.last_activity_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric"
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
        {vols && (vols.volunteers_total ?? 0) > vols.volunteers.length ? (
          <p className="m-0 mt-3 text-sm text-muted">
            Showing the top {vols.volunteers.length} of {vols.volunteers_total} volunteers.{" "}
            <a href={exp("volunteer_hours", "csv")} className="font-semibold text-primary underline">
              Download all as CSV
            </a>
          </p>
        ) : null}
        <p className="m-0 mt-3 text-xs text-muted">
          Service volunteers log outside Volunteer Services is self-reported and never included here.
        </p>
      </section>
    </>
  );
}
