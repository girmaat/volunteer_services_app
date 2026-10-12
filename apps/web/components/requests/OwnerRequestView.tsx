import Link from "next/link";
import { Lock } from "lucide-react";
import { requestAction, deleteDraft, ownerApprovalAction, checkinCodeAction } from "../../app/_requests/actions";
import QrCode from "../../app/_components/share/QrCode";
import { Button, ButtonLink, Card, Notice, PageHeader, StatusPill, Toast } from "../ui";
import { STATUS_HELP, type Category, type OwnerRequest } from "../../lib/requests";
import { describeRrule, formatInZone, zoneOr } from "../../lib/time";

const FLASH: Record<string, string> = {
  published: "Your request is live. We'll let you know when someone applies.",
  submitted: "Submitted for review. We'll email you when a moderator approves it.",
  pause: "Paused. It's hidden from search until you resume.",
  resume: "Resumed. Volunteers can find it again.",
  complete: "Marked complete. Volunteers have 14 days to leave a review.",
  cancel: "Canceled. Everyone who applied was told.",
  awaiting_owner: "Sent to your organization’s owner for approval. It goes live when they approve it.",
  owner_approved: "Approved and published.",
  owner_rejected: "Sent back with your note. It stays private until it’s resubmitted.",
  code_rotated: "New check-in code made. The old one no longer works."
};

const EVENT_LABEL: Record<string, string> = {
  create: "Draft created",
  publish: "Published",
  submit_for_review: "Submitted for review",
  approve: "Approved by a moderator",
  reject: "Changes requested by a moderator",
  pause: "Paused",
  resume: "Resumed",
  staffing: "Staffing changed",
  waitlist_promoted: "Waitlisted volunteer moved up",
  waitlist_offered: "A spot was offered to the next person on the waitlist",
  submit_for_owner_approval: "Sent to the owner for approval",
  owner_approved: "Approved by the owner",
  owner_rejected: "Sent back by the owner",
  complete: "Completed",
  cancel: "Canceled",
  take_down: "Removed by a moderator",
  restore: "Restored by a moderator",
  migrated: "Imported",
  material_edit: "Edited (volunteers asked to re-confirm)"
};

export default function OwnerRequestView({
  r,
  categories,
  base,
  flash,
  error,
  extraLinks,
  isOwner,
  checkinUrl
}: {
  /** Org admin: can approve coordinators' requests. */
  isOwner?: boolean;
  /** The on-site check-in link when a code exists (organization requests). */
  checkinUrl?: string | null;
  r: OwnerRequest;
  categories: Category[];
  base: "/requester/requests" | "/org/requests";
  flash?: string;
  error?: string;
  extraLinks?: { href: string; label: string }[];
}) {
  const tz = zoneOr(r.timezone);
  const cat = categories.find((c) => c.slug === r.category);
  const detail = `${base}/${r.id}`;
  const editable = !["completed", "canceled"].includes(r.status);
  const when =
    r.schedule_type === "flexible_window"
      ? `Flexible${r.apply_by ? ` · apply by ${formatInZone(r.apply_by, tz, { dateOnly: true })}` : ""}`
      : `${r.schedule_type === "recurring" ? describeRrule(r.recurrence_rule) + " · from " : ""}${formatInZone(r.starts_at, tz, { withZone: true }) || "Date to be set"}`;

  return (
    <>
      <PageHeader
        back={<Link prefetch={false} href={base}>← All requests</Link>}
        title={r.title || "Untitled draft"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusPill kind="request" status={r.review_status === "pending_review" ? "in_review" : r.status} />
            <span>{r.review_status === "pending_review" ? "Waiting for a moderator. Only you can see it." : STATUS_HELP[r.status]}</span>
          </span>
        }
        actions={
          <>
            {r.status !== "draft" ? <ButtonLink href={`${detail}/applications`}>Applicants ({r.staffing.accepted}/{r.staffing.needed})</ButtonLink> : null}
            {editable ? (
              <ButtonLink href={`${base.replace("/requests", "/requests/new")}?id=${r.id}&step=${r.status === "draft" ? 5 : 1}`} variant="secondary">
                {r.status === "draft" ? "Continue draft" : "Edit"}
              </ButtonLink>
            ) : null}
          </>
        }
      />
      {flash && FLASH[flash] ? <Toast message={FLASH[flash]} /> : null}
      {error ? (
        <div className="mb-5">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {r.owner_approval === "pending" ? (
        <div className="mb-5 grid gap-3 rounded-md border border-warning bg-warning-tint p-4">
          <p className="m-0 font-medium">Waiting for the organization owner’s approval. It isn’t public yet.</p>
          {isOwner ? (
            <form action={ownerApprovalAction} className="grid gap-2">
              <input type="hidden" name="id" value={r.id} />
              <label className="grid gap-1 text-sm font-medium">
                Note for the coordinator <span className="font-normal">(needed if you send it back)</span>
                <textarea name="notes" rows={2} maxLength={1000} className="rounded border border-line-strong bg-surface px-3 py-2 text-sm font-normal" />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="decision" value="approve" size="sm">
                  Approve and publish
                </Button>
                <Button type="submit" name="decision" value="reject" size="sm" variant="secondary">
                  Send back
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
      {r.owner_approval === "rejected" && r.status === "draft" ? (
        <div className="mb-5">
          <Notice tone="warning">The owner sent this back{r.owner_approval_notes ? `: ${r.owner_approval_notes}` : "."} Edit it and publish again to resubmit.</Notice>
        </div>
      ) : null}
      {r.review_status === "rejected" ? (
        <div className="mb-5">
          <Notice tone="warning">A moderator asked for changes{r.review_notes ? `: ${r.review_notes}` : "."} Edit and submit again.</Notice>
        </div>
      ) : null}
      {r.removed_reason ? (
        <div className="mb-5">
          <Notice tone="danger">Removed by a moderator: {r.removed_reason}</Notice>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="grid content-start gap-6">
          <Card>
            <dl className="m-0 grid gap-4 sm:grid-cols-[150px_1fr]">
              <dt className="text-sm font-medium text-muted">Category</dt>
              <dd className="m-0">{cat?.label || "—"}</dd>
              <dt className="text-sm font-medium text-muted">When</dt>
              <dd className="m-0">{when}</dd>
              <dt className="text-sm font-medium text-muted">Where</dt>
              <dd className="m-0">
                {r.mode === "remote" ? "Remote" : r.public_area || "—"}
                {r.exact_address ? (
                  <span className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Lock aria-hidden className="h-3.5 w-3.5" /> {r.exact_address} — shown only to accepted volunteers
                  </span>
                ) : null}
              </dd>
              <dt className="text-sm font-medium text-muted">Volunteers</dt>
              <dd className="m-0">
                {r.staffing.accepted} of {r.staffing.needed} filled
                {r.staffing.offered ? ` · ${r.staffing.offered} spot${r.staffing.offered === 1 ? "" : "s"} offered` : ""}
                {r.staffing.waitlisted ? ` · ${r.staffing.waitlisted} waitlisted` : ""}
              </dd>
              {r.target_value != null && r.progress ? (
                <>
                  <dt className="text-sm font-medium text-muted">Goal</dt>
                  <dd className="m-0">
                    {r.target_value} {r.target_unit}
                    <span className="block text-sm text-muted">
                      {r.progress.committed} promised · {r.progress.approved} approved · {r.progress.waiting_approval} waiting for approval
                      {r.progress.open_capacity ? ` · ${r.progress.open_capacity} still open` : ""}
                    </span>
                  </dd>
                </>
              ) : r.progress && (r.progress.approved_hours || r.progress.waiting_approval) ? (
                <>
                  <dt className="text-sm font-medium text-muted">Hours</dt>
                  <dd className="m-0">
                    {r.progress.approved_hours} approved · {r.progress.waiting_approval} waiting for approval
                  </dd>
                </>
              ) : null}
              {r.required_skills.length || r.nice_to_have_skills.length ? (
                <>
                  <dt className="text-sm font-medium text-muted">Skills</dt>
                  <dd className="m-0">
                    {r.required_skills.join(", ")}
                    {r.nice_to_have_skills.length ? <span className="text-muted"> · nice to have: {r.nice_to_have_skills.join(", ")}</span> : null}
                  </dd>
                </>
              ) : null}
              <dt className="text-sm font-medium text-muted">Description</dt>
              <dd className="m-0 whitespace-pre-line">{r.description || "—"}</dd>
            </dl>
          </Card>
          {extraLinks?.length ? (
            <nav aria-label="More for this request" className="flex flex-wrap gap-4 text-sm">
              {extraLinks.map((l) => (
                <Link prefetch={false} key={l.href} href={l.href} className="font-medium text-primary">
                  {l.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className="m-0 mb-2 text-lg">
              History
            </h2>
            <ol className="m-0 border-l border-line pl-4">
              {r.events.map((e, i) => (
                <li key={i} className="mb-3 list-none text-sm">
                  <span className="font-medium">{EVENT_LABEL[e.event] || e.event}</span>{" "}
                  <span className="text-muted">· {formatInZone(e.created_at, tz)}</span>
                  {e.reason ? <p className="m-0 mt-0.5 text-muted">{e.reason}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-label="Request actions" className="grid content-start gap-4">
          {r.actions.filter((a) => a !== "cancel" && a !== "publish").map((a) => (
            <form key={a} action={requestAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="event" value={a} />
              <input type="hidden" name="back" value={detail} />
              <Button type="submit" variant="secondary" className="w-full">
                {a === "pause" ? "Pause (hide from search)" : a === "resume" ? "Resume" : "Mark as completed"}
              </Button>
            </form>
          ))}
          {r.actions.includes("cancel") && r.status !== "draft" ? (
            <form action={requestAction} className="grid gap-2 rounded-md border border-line bg-surface p-4">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="event" value="cancel" />
              <input type="hidden" name="back" value={detail} />
              <label htmlFor="cancel-reason" className="text-sm font-medium">
                Cancel this request
              </label>
              <textarea
                id="cancel-reason"
                name="reason"
                required
                maxLength={500}
                placeholder="Why? Applicants will see this."
                className="min-h-[80px] w-full rounded border border-line-strong bg-surface px-3 py-2 text-sm"
              />
              <Button type="submit" variant="danger" size="sm">
                Cancel request
              </Button>
            </form>
          ) : null}
          {base === "/org/requests" && ["open", "pending", "filled", "paused"].includes(r.status) ? (
            <section id="checkin" aria-labelledby="checkin-h" className="grid gap-3 rounded-md border border-line bg-surface p-4">
              <h2 id="checkin-h" className="m-0 text-base font-semibold">
                On-site check-in
              </h2>
              {checkinUrl ? (
                <>
                  <p className="m-0 text-sm text-muted">Show or print this code at the site. Volunteers scan it with their phone to check in and out; their hours come to you for approval.</p>
                  <div className="w-fit rounded border border-line bg-white p-2">
                    <QrCode text={checkinUrl} size={180} title="Check-in code for this request" />
                  </div>
                  <p className="m-0 break-all text-xs text-muted">{checkinUrl}</p>
                  <form action={checkinCodeAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="rotate" value="1" />
                    <Button type="submit" size="sm" variant="ghost">
                      Make a new code
                    </Button>
                  </form>
                </>
              ) : (
                <form action={checkinCodeAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <Button type="submit" size="sm" variant="secondary" className="w-full">
                    Show check-in code
                  </Button>
                </form>
              )}
            </section>
          ) : null}
          {r.status === "draft" && !r.published_at ? (
            <form action={deleteDraft}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="list" value={base} />
              <Button type="submit" variant="ghost" className="w-full">
                Delete draft
              </Button>
            </form>
          ) : null}
        </aside>
      </div>
    </>
  );
}
