import { notFound } from "next/navigation";
import Link from "next/link";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { backendFetch } from "../../app/lib/backend";
import { applicantAction, attendanceAction, noShowAction } from "../../app/_requests/applicant-actions";
import { getOrgContext } from "../../app/lib/org";
import { Button, EmptyState, Notice, PageHeader, StatusPill, Toast, VerifiedBadge } from "../ui";
import ReviewPanel, { type ReviewState } from "../reviews/ReviewPanel";
import { formatInZone, isoToZonedLocal, zoneOr } from "../../lib/time";

type Applicant = {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  display_name: string;
  public_location: string | null;
  bio: string | null;
  skills: string[] | null;
  background_check_status: string | null;
  verified: boolean;
  email: string | null;
  phone: string | null;
  start_at: string | null;
  volunteer_confirmed_at: string | null;
  no_show: boolean | null;
  conversation_id: string | null;
  volunteer_user_id: string;
  reliability: { completed: number; late_cancels: number; no_shows: number; rate: number | null };
  avg_rating: string | null;
  review_count: number;
  minor?: boolean;
  offered_amount?: number | null;
  accepted_amount?: number | null;
  offer_expires_at?: string | null;
  prerequisites?: { status: "cleared" | "pending" | "blocked"; items: { label: string; state: string; detail: string | null }[] };
  review?: ReviewState | null;
};

const FLASH: Record<string, string> = {
  accept: "Accepted. They can now see the exact address and your contact details.",
  waitlist: "Waitlisted. If a spot opens they'll be offered it and have 24 hours to say yes.",
  decline: "Declined. We let them know kindly.",
  reconsider: "Moved back to review.",
  confirm: "Confirmed. We'll send reminders 48 hours and 2 hours before.",
  complete: "Marked complete. Reviews are open for 14 days.",
  cancel: "Canceled. If anyone was waitlisted, the next person was offered the spot.",
  no_show: "Recorded as a no-show.",
  reviewed: "Review saved.",
  checked_in: "Checked in. Check them out when they leave to log their hours.",
  checked_out: "Checked out. Their hours are on the attendance log."
};

function Reliability({ r }: { r: Applicant["reliability"] }) {
  if (!r || (r.completed === 0 && r.late_cancels === 0 && r.no_shows === 0)) return <span>New volunteer</span>;
  return (
    <span>
      {r.completed} completed
      {r.late_cancels ? ` · ${r.late_cancels} late cancel${r.late_cancels === 1 ? "" : "s"}` : ""}
      {r.no_shows ? ` · ${r.no_shows} no-show${r.no_shows === 1 ? "" : "s"}` : ""}
      {r.rate != null ? ` · ${r.rate}% reliable` : ""}
    </span>
  );
}

export default async function ApplicantsView({ requestId, base, flash, error }: { requestId: string; base: "/requester/requests" | "/org/requests"; flash?: string; error?: string }) {
  const res = await backendFetch(`/v1/requests/${requestId}/applicants`);
  // Someone else's request: same answer as a request that doesn't exist.
  if (res.status === 403 || res.status === 404) notFound();
  if (!res.ok) return <Notice tone="danger">Applicants couldn&apos;t load.</Notice>;
  const data = (await res.json()) as {
    request: {
      timezone?: string | null;
      id: string;
      title: string;
      status: string;
      volunteers_needed: number;
      starts_at: string | null;
      target: number | null;
      unit: string | null;
      allow_overfill: boolean;
      offered: number;
      committed: number;
      approved: number;
      waiting_approval: number;
      open_capacity: number | null;
    };
    applicants: Applicant[];
  };
  const back = `${base}/${requestId}/applications`;
  // Times show in the request's own zone (where the work happens).
  const tz = zoneOr(data.request.timezone);
  const accepted = data.applicants.filter((a) => ["accepted", "confirmed", "completed"].includes(a.status)).length;
  // Organizations take attendance here: who is checked in right now.
  const isOrg = base === "/org/requests";
  // Plain organization members can look but not act (the server refuses their actions anyway).
  const readOnly = isOrg && (await getOrgContext())?.membership.role === "member";
  const openAttendance = new Set<string>();
  if (isOrg && accepted > 0) {
    const r = await backendFetch(`/v1/org/attendance?requestId=${requestId}&status=open`);
    if (r.ok) for (const row of ((await r.json()) as { attendance?: { volunteer_user_id: string }[] }).attendance ?? []) openAttendance.add(row.volunteer_user_id);
  }
  // The applicants response carries each completed volunteer's review state (no per-person calls).
  const reviews = data.applicants.map((a) => (a.status === "completed" ? (a.review ?? null) : null));

  return (
    <>
      <PageHeader
        back={<Link prefetch={false} href={`${base}/${requestId}`}>← {data.request.title}</Link>}
        title="Applicants"
        description={`${accepted} of ${data.request.volunteers_needed} spots filled${data.request.offered ? `, ${data.request.offered} offered` : ""}. Contact details unlock when you accept someone (never for volunteers under 18).`}
      />
      {data.request.target != null ? (
        <p className="-mt-2 mb-5 text-sm">
          <span className="font-medium">
            Goal {data.request.target} {data.request.unit}:
          </span>{" "}
          {data.request.committed} promised · {data.request.approved} approved · {data.request.waiting_approval} waiting for approval
          {data.request.open_capacity ? ` · ${data.request.open_capacity} still open` : ""}
        </p>
      ) : null}
      {flash && FLASH[flash] ? <Toast message={FLASH[flash]} /> : null}
      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {!data.applicants.length ? <EmptyState title="No applicants yet" body="We'll notify you as soon as someone applies." /> : null}
      <ul className="m-0 grid gap-4 p-0">
        {data.applicants.map((a, i) => {
          const act = applicantAction.bind(null, requestId, back, a.id);
          const past = Boolean((a.start_at || data.request.starts_at) && new Date(a.start_at || data.request.starts_at!) < new Date());
          return (
            <li key={a.id} id={`a-${a.id}`} className="list-none rounded-md border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 flex flex-wrap items-center gap-2 font-semibold">
                    {a.display_name}
                    {a.verified ? <VerifiedBadge label="ID verified" /> : null}
                    {a.background_check_status === "cleared" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                        <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> Background check
                      </span>
                    ) : null}
                  </p>
                  <p className="m-0 mt-0.5 text-sm text-muted">
                    {a.public_location || "Location not shared"} · <Reliability r={a.reliability} />
                    {a.review_count ? ` · ${a.avg_rating}★ from ${a.review_count} review${a.review_count === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <StatusPill status={a.no_show ? "no-show" : a.status} />
              </div>
              {a.minor ? <p className="m-0 mt-1 text-sm font-medium text-primary">Under 18 · talk in messages; contact details stay hidden</p> : null}
              {a.offered_amount != null ? (
                <p className="m-0 mt-1 text-sm">
                  <span className="font-medium">Offered:</span> {a.offered_amount} {data.request.unit}
                  {a.accepted_amount != null ? ` · accepted ${a.accepted_amount} ${data.request.unit}` : ""}
                </p>
              ) : null}
              {a.status === "offered" && a.offer_expires_at ? <p className="m-0 mt-1 text-sm text-muted">Offered a spot from the waitlist; they have until {formatInZone(a.offer_expires_at, tz)} to say yes.</p> : null}
              {a.prerequisites && a.prerequisites.items.length ? (
                <p className={`m-0 mt-1 text-sm ${a.prerequisites.status === "cleared" ? "text-success" : a.prerequisites.status === "blocked" ? "text-danger" : "text-warning"}`}>
                  {a.prerequisites.status === "cleared"
                    ? "Ready to check in: forms and consent done"
                    : `Before check-in: ${a.prerequisites.items.filter((i) => i.state !== "done").map((i) => i.label.replace(/^(Form|Training): /, "") + (i.state === "stale" ? " (new version)" : i.state === "requested" ? " (asked)" : i.state === "declined" ? " (declined)" : "")).join(", ")}`}
                </p>
              ) : null}
              {a.message ? <p className="m-0 mt-2 max-w-[70ch] whitespace-pre-line">{a.message}</p> : null}
              {a.skills?.length ? <p className="m-0 mt-1 text-sm text-muted">Skills: {a.skills.join(", ")}</p> : null}
              {a.email || a.phone ? (
                <p className="m-0 mt-2 text-sm">
                  <span className="font-medium">Contact:</span> {[a.email, a.phone].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {a.start_at ? (
                <p className="m-0 mt-1 text-sm text-muted">
                  Scheduled {formatInZone(a.start_at, tz, { withZone: true })}
                  {a.volunteer_confirmed_at ? <span className="font-medium text-success"> · confirmed they&apos;re coming</span> : null}
                </p>
              ) : null}

              {readOnly ? (
                <p className="m-0 mt-3 text-sm text-muted">Admins and managers accept volunteers, take attendance and message them.</p>
              ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {a.status === "pending" || a.status === "waitlisted" || a.status === "offered" ? (
                  <>
                    <form action={act} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="action" value="accept" />
                      {data.request.target != null && a.offered_amount != null ? (
                        <label className="flex items-center gap-1.5 text-sm">
                          <span className="sr-only">Amount to accept</span>
                          <input
                            name="acceptedAmount"
                            type="number"
                            min={0.25}
                            step="any"
                            max={a.offered_amount}
                            defaultValue={data.request.allow_overfill || data.request.open_capacity == null ? a.offered_amount : Math.min(a.offered_amount, data.request.open_capacity)}
                            className="h-9 w-24 rounded border border-line-strong bg-surface px-2 text-sm"
                          />
                          {data.request.unit}
                        </label>
                      ) : null}
                      <Button type="submit" size="sm">Accept</Button>
                    </form>
                    {a.status === "pending" ? (
                      <form action={act}>
                        <input type="hidden" name="action" value="waitlist" />
                        <Button type="submit" size="sm" variant="secondary">Waitlist</Button>
                      </form>
                    ) : null}
                    <form action={act}>
                      <input type="hidden" name="action" value="decline" />
                      <Button type="submit" size="sm" variant="ghost">Decline</Button>
                    </form>
                  </>
                ) : null}
                {a.status === "accepted" ? (
                  <form action={act} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="action" value="confirm" />
                    <input type="hidden" name="tz" value={tz} />
                    <label className="text-sm">
                      <span className="sr-only">Start time</span>
                      <input type="datetime-local" name="startAt" defaultValue={isoToZonedLocal(data.request.starts_at, tz)} className="h-9 rounded border border-line-strong bg-surface px-2 text-sm" />
                    </label>
                    <Button type="submit" size="sm" variant="secondary">Confirm schedule</Button>
                  </form>
                ) : null}
                {a.status === "accepted" || a.status === "confirmed" ? (
                  <>
                    {isOrg && (!a.prerequisites || a.prerequisites.status === "cleared" || openAttendance.has(a.volunteer_user_id)) ? (
                      openAttendance.has(a.volunteer_user_id) ? (
                        <form action={attendanceAction.bind(null, back, a.id, "check-out")}>
                          <Button type="submit" size="sm">Check out</Button>
                        </form>
                      ) : (
                        <form action={attendanceAction.bind(null, back, a.id, "check-in")}>
                          <Button type="submit" size="sm" variant="secondary">Check in</Button>
                        </form>
                      )
                    ) : null}
                    {isOrg && openAttendance.has(a.volunteer_user_id) ? <span className="text-sm font-medium text-success">Checked in</span> : null}
                    <form action={act}>
                      <input type="hidden" name="action" value="complete" />
                      <Button type="submit" size="sm" variant="secondary">Mark complete</Button>
                    </form>
                    <form action={act}>
                      <input type="hidden" name="action" value="cancel" />
                      <Button type="submit" size="sm" variant="ghost">Cancel</Button>
                    </form>
                    {past ? (
                      <form action={noShowAction.bind(null, back, a.id)}>
                        <Button type="submit" size="sm" variant="ghost">Didn&apos;t show up</Button>
                      </form>
                    ) : null}
                  </>
                ) : null}
                <Link prefetch={false} href={a.conversation_id ? `/inbox/${a.conversation_id}` : `/inbox/start?requestId=${requestId}&volunteerId=${a.volunteer_user_id}`} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  <MessageSquare aria-hidden className="h-4 w-4" /> Message
                </Link>
              </div>
              )}
              {reviews[i] ? (
                <div className="mt-3">
                  <ReviewPanel applicationId={a.id} back={back} state={reviews[i]!} otherName={a.display_name} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
