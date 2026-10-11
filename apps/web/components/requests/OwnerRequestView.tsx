import Link from "next/link";
import { Lock } from "lucide-react";
import { requestAction, deleteDraft } from "../../app/_requests/actions";
import { Button, ButtonLink, Card, Notice, PageHeader, StatusPill } from "../ui";
import { STATUS_HELP, type Category, type OwnerRequest } from "../../lib/requests";
import { describeRrule, formatInZone } from "../../lib/time";

const FLASH: Record<string, string> = {
  published: "Your request is live. We'll let you know when someone applies.",
  submitted: "Submitted for review. We'll email you when a moderator approves it.",
  pause: "Paused. It's hidden from search until you resume.",
  resume: "Resumed. Volunteers can find it again.",
  complete: "Marked complete. Volunteers have 14 days to leave a review.",
  cancel: "Canceled. Everyone who applied was told."
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
  complete: "Completed",
  cancel: "Canceled",
  take_down: "Removed by a moderator",
  restore: "Restored by a moderator",
  migrated: "Imported"
};

export default function OwnerRequestView({
  r,
  categories,
  base,
  flash,
  error,
  extraLinks
}: {
  r: OwnerRequest;
  categories: Category[];
  base: "/requester/requests" | "/org/requests";
  flash?: string;
  error?: string;
  extraLinks?: { href: string; label: string }[];
}) {
  const tz = r.timezone || "America/New_York";
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
        back={<Link href={base}>← All requests</Link>}
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
      {flash && FLASH[flash] ? (
        <div className="mb-5">
          <Notice tone="success">{FLASH[flash]}</Notice>
        </div>
      ) : null}
      {error ? (
        <div className="mb-5">
          <Notice tone="danger">{error}</Notice>
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
                {r.staffing.waitlisted ? ` · ${r.staffing.waitlisted} waitlisted` : ""}
              </dd>
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
                <Link key={l.href} href={l.href} className="font-medium text-primary">
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
