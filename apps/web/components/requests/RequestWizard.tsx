import Link from "next/link";
import { AlertTriangle, Check, Lock } from "lucide-react";
import { publishDraft, saveWizardStep } from "../../app/_requests/actions";
import { Button, Card, Notice } from "../ui";
import { cn } from "../../lib/cn";
import type { Category, OwnerRequest } from "../../lib/requests";
import { COMMON_TIMEZONES, DAY_LABELS, WEEK_DAYS, describeRrule, formatInZone, isoToZonedLocal, rruleDays } from "../../lib/time";

const STEPS = ["Basics", "When", "Where", "Requirements", "Review"] as const;

const label = "text-sm font-medium text-ink";
const control =
  "w-full rounded border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-muted focus-visible:border-primary focus-visible:outline-none";
const input = cn(control, "h-11");
const hint = "m-0 text-xs text-muted";

function Progress({ step, base, id }: { step: number; base: string; id?: string }) {
  return (
    <nav aria-label="Steps" className="mb-6">
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          const body = (
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm",
                current ? "border-primary bg-primary text-primary-ink" : done ? "border-line-strong bg-surface text-ink" : "border-line bg-surface text-muted"
              )}
            >
              <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold">
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              {s}
            </span>
          );
          return (
            <li key={s} aria-current={current ? "step" : undefined}>
              {id && !current ? (
                <Link href={`${base}?id=${id}&step=${n}`} className="no-underline">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Hidden({ base, owner, step, id }: { base: string; owner: string; step: number; id?: string }) {
  return (
    <>
      <input type="hidden" name="base" value={base} />
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="step" value={step} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
    </>
  );
}

function Nav({ step }: { step: number }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
      <div>
        {step > 1 ? (
          <Button type="submit" name="nav" value="back" variant="ghost">
            Back
          </Button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="submit" name="nav" value="save" variant="secondary">
          Save draft
        </Button>
        <Button type="submit" name="nav" value="next">
          Continue
        </Button>
      </div>
    </div>
  );
}

export default function RequestWizard({
  owner,
  base,
  detailBase,
  step,
  draft,
  categories,
  error,
  saved,
  canPostSensitive
}: {
  owner: "requester" | "org";
  base: string;
  detailBase: string;
  step: number;
  draft: OwnerRequest | null;
  categories: Category[];
  error?: string;
  saved?: boolean;
  canPostSensitive: boolean;
}) {
  const d = draft;
  const tz = d?.timezone || "America/New_York";
  const id = d?.id;
  const cat = categories.find((c) => c.slug === d?.category);
  const regular = categories.filter((c) => !c.is_sensitive);
  const sensitive = categories.filter((c) => c.is_sensitive);

  return (
    <div className="max-w-3xl">
      <Progress step={step} base={base} id={id} />
      {error ? (
        <div className="mb-5">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {saved ? (
        <div className="mb-5">
          <Notice tone="success">Draft saved. You can come back to it from your requests.</Notice>
        </div>
      ) : null}

      {step === 1 ? (
        <>
          <div className="mb-5 flex gap-3 rounded border border-warning bg-warning-tint px-4 py-3 text-sm" role="note">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="m-0">
              <strong>Not for urgent or life-threatening needs.</strong> If someone is in danger, call your local emergency number (911 in the US).
            </p>
          </div>
          <form action={saveWizardStep} className="grid gap-5">
            <Hidden base={base} owner={owner} step={1} id={id} />
            <div className="grid gap-1.5">
              <label htmlFor="w-title" className={label}>
                Title
              </label>
              <input id="w-title" name="title" required minLength={3} maxLength={120} defaultValue={d?.title || ""} placeholder="Help sorting coats for a giveaway" className={input} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="w-cat" className={label}>
                Category
              </label>
              <select id="w-cat" name="category" required defaultValue={d?.category || ""} className={input} aria-describedby="w-cat-hint">
                <option value="" disabled>
                  Choose a category
                </option>
                <optgroup label="Everyday help">
                  {regular.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Sensitive — verified accounts, reviewed before going live">
                  {sensitive.map((c) => (
                    <option key={c.slug} value={c.slug} disabled={!canPostSensitive}>
                      {c.label}
                      {canPostSensitive ? "" : " (verify your account first)"}
                    </option>
                  ))}
                </optgroup>
              </select>
              <p id="w-cat-hint" className={hint}>
                Help inside a home, money, health, children and in-home elder care are reviewed by our team and shown only to verified volunteers.
              </p>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="w-desc" className={label}>
                What do you need?
              </label>
              <textarea
                id="w-desc"
                name="description"
                required
                minLength={10}
                maxLength={5000}
                defaultValue={d?.description || ""}
                className={cn(control, "min-h-[160px] py-2.5 leading-relaxed")}
                aria-describedby="w-desc-hint"
              />
              <p id="w-desc-hint" className={hint}>
                Describe the task, what a good outcome looks like, and anything a volunteer should bring. Don&apos;t include your phone, email or address here.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="w-req" className={label}>
                  Skills needed <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="w-req" name="requiredSkills" defaultValue={(d?.required_skills || []).join(", ")} placeholder="lifting, sorting" className={input} />
                <p className={hint}>Separate with commas.</p>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="w-nice" className={label}>
                  Nice to have <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="w-nice" name="niceToHaveSkills" defaultValue={(d?.nice_to_have_skills || []).join(", ")} placeholder="spanish" className={input} />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="w-n" className={label}>
                  Volunteers needed
                </label>
                <input id="w-n" name="volunteersNeeded" type="number" min={1} max={500} required defaultValue={d?.volunteers_needed ?? 1} className={input} />
              </div>
              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className={cn(label, "mb-1.5 p-0")}>How soon?</legend>
                <div className="flex flex-wrap gap-4">
                  {[
                    ["low", "Whenever"],
                    ["normal", "Soon"],
                    ["high", "This week"]
                  ].map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="urgency" value={v} defaultChecked={(d?.urgency || "normal") === v} className="h-4 w-4 accent-[var(--primary)]" />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <Nav step={1} />
          </form>
        </>
      ) : null}

      {step === 2 && d ? (
        <form action={saveWizardStep} className="grid gap-5">
          <Hidden base={base} owner={owner} step={2} id={id} />
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className={cn(label, "mb-1.5 p-0")}>Schedule</legend>
            {[
              ["one_time", "One time", "A single date and time"],
              ["recurring", "Recurring", "Repeats on certain days"],
              ["flexible_window", "Flexible", "Any time before a date"]
            ].map(([v, l, h]) => (
              <label key={v} className="flex items-start gap-2.5 rounded border border-line bg-surface px-3 py-2.5 text-sm has-[:checked]:border-primary">
                <input type="radio" name="scheduleType" value={v} defaultChecked={d.schedule_type === v} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span>
                  <span className="font-medium">{l}</span> <span className="text-muted">— {h}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5 sm:max-w-xs">
            <label htmlFor="w-tz" className={label}>
              Time zone
            </label>
            <select id="w-tz" name="timezone" defaultValue={tz} className={input}>
              {(COMMON_TIMEZONES.includes(tz) ? COMMON_TIMEZONES : [tz, ...COMMON_TIMEZONES]).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="w-start" className={label}>
                Starts <span className="font-normal text-muted">(one-time or first session)</span>
              </label>
              <input id="w-start" name="startsAt" type="datetime-local" defaultValue={isoToZonedLocal(d.starts_at, tz)} className={input} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="w-end" className={label}>
                Ends <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="w-end" name="endsAt" type="datetime-local" defaultValue={isoToZonedLocal(d.ends_at, tz)} className={input} />
            </div>
          </div>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className={cn(label, "mb-1.5 p-0")}>
              Repeats on <span className="font-normal text-muted">(recurring only)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {WEEK_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 rounded border border-line bg-surface px-2.5 py-1.5 text-sm has-[:checked]:border-primary">
                  <input type="checkbox" name="days" value={day} defaultChecked={rruleDays(d.recurrence_rule).includes(day)} className="h-4 w-4 accent-[var(--primary)]" />
                  {DAY_LABELS[day]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="w-dur" className={label}>
                How long each time? <span className="font-normal text-muted">(minutes)</span>
              </label>
              <input id="w-dur" name="durationMinutes" type="number" min={15} max={1440} step={15} defaultValue={d.duration_minutes ?? ""} className={input} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="w-apply" className={label}>
                Apply by <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="w-apply" name="applyBy" type="date" defaultValue={isoToZonedLocal(d.apply_by, tz, true)} className={input} />
            </div>
          </div>
          <Nav step={2} />
        </form>
      ) : null}

      {step === 3 && d ? (
        <form action={saveWizardStep} className="grid gap-5">
          <Hidden base={base} owner={owner} step={3} id={id} />
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className={cn(label, "mb-1.5 p-0")}>Where does it happen?</legend>
            <div className="flex flex-wrap gap-4">
              {[
                ["in-person", "In person"],
                ["remote", "Remote (phone or video)"],
                ["hybrid", "Hybrid"]
              ].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="mode" value={v} defaultChecked={d.mode === v} className="h-4 w-4 accent-[var(--primary)]" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <label htmlFor="w-area" className={label}>
              Area shown publicly
            </label>
            <input id="w-area" name="publicArea" maxLength={120} defaultValue={d.public_area || ""} placeholder="Upper West Side, Manhattan, NY" className={input} aria-describedby="w-area-hint" />
            <p id="w-area-hint" className={hint}>
              A neighborhood or city. Required for in-person and hybrid.
            </p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="w-addr" className={cn(label, "flex items-center gap-1.5")}>
              <Lock aria-hidden className="h-3.5 w-3.5 text-muted" /> Exact address <span className="font-normal text-muted">(private, optional)</span>
            </label>
            <input id="w-addr" name="exactAddress" maxLength={300} defaultValue={d.exact_address || ""} placeholder="Street, building, apartment" className={input} aria-describedby="w-addr-hint" />
            <p id="w-addr-hint" className={hint}>
              Only volunteers you accept see this. Everyone else sees the area above.
            </p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="w-acc" className={label}>
              Access notes <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="w-acc" name="accessibilityNotes" maxLength={1000} defaultValue={d.accessibility_notes || ""} placeholder="Fourth-floor walk-up, no elevator" className={cn(control, "min-h-[90px] py-2.5")} />
          </div>
          <Nav step={3} />
        </form>
      ) : null}

      {step === 4 && d ? (
        <form action={saveWizardStep} className="grid gap-5">
          <Hidden base={base} owner={owner} step={4} id={id} />
          <div className="grid gap-1.5 sm:max-w-xs">
            <label htmlFor="w-age" className={label}>
              Minimum age <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="w-age" name="minAge" type="number" min={13} max={99} defaultValue={d.min_age ?? ""} className={input} />
          </div>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className={cn(label, "mb-1.5 p-0")}>Volunteers must…</legend>
            {[
              ["requiresCar", "Have a car", d.requires_car],
              ["requiresBackgroundCheck", "Have a cleared background check", d.requires_background_check],
              ["requiresTraining", "Complete training first", d.requires_training],
              ["requiresWaiver", "Sign a waiver", d.requires_waiver]
            ].map(([n, l, v]) => (
              <label key={String(n)} className="flex items-center gap-2.5 text-sm">
                <input type="checkbox" name={String(n)} defaultChecked={Boolean(v)} className="h-4 w-4 accent-[var(--primary)]" />
                {String(l)}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <label htmlFor="w-eq" className={label}>
              Equipment or what to bring <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="w-eq" name="equipmentNotes" maxLength={1000} defaultValue={d.equipment_notes || ""} className={cn(control, "min-h-[90px] py-2.5")} />
          </div>
          <Nav step={4} />
        </form>
      ) : null}

      {step === 5 && d ? (
        <div className="grid gap-5">
          <Card>
            <dl className="m-0 grid gap-4 sm:grid-cols-[180px_1fr]">
              <Row label="Title" value={d.title} edit={`${base}?id=${id}&step=1`} />
              <Row label="Category" value={cat ? `${cat.label}${cat.is_sensitive ? " · reviewed before going live" : ""}` : "—"} edit={`${base}?id=${id}&step=1`} />
              <Row label="Description" value={d.description} edit={`${base}?id=${id}&step=1`} />
              <Row label="Skills" value={[...d.required_skills, ...d.nice_to_have_skills.map((s) => `${s} (nice to have)`)].join(", ") || "—"} edit={`${base}?id=${id}&step=1`} />
              <Row label="Volunteers" value={String(d.volunteers_needed)} edit={`${base}?id=${id}&step=1`} />
              <Row
                label="When"
                value={
                  d.schedule_type === "flexible_window"
                    ? `Flexible${d.apply_by ? `, before ${formatInZone(d.apply_by, tz, { dateOnly: true })}` : ""}`
                    : `${d.schedule_type === "recurring" ? describeRrule(d.recurrence_rule) + ", from " : ""}${formatInZone(d.starts_at, tz, { withZone: true }) || "—"}`
                }
                edit={`${base}?id=${id}&step=2`}
              />
              <Row label="Where" value={d.mode === "remote" ? "Remote" : `${d.public_area || "—"}${d.exact_address ? " · exact address shared after acceptance" : ""}`} edit={`${base}?id=${id}&step=3`} />
              <Row
                label="Requirements"
                value={
                  [
                    d.min_age ? `${d.min_age}+` : null,
                    d.requires_car ? "car" : null,
                    d.requires_background_check ? "background check" : null,
                    d.requires_training ? "training" : null,
                    d.requires_waiver ? "waiver" : null
                  ]
                    .filter(Boolean)
                    .join(", ") || "None"
                }
                edit={`${base}?id=${id}&step=4`}
              />
            </dl>
          </Card>
          {d.publish_problems.length ? (
            <Notice tone="warning">
              Before publishing: {d.publish_problems.join("; ")}.
            </Notice>
          ) : null}
          {d.review_status === "rejected" && d.review_notes ? <Notice tone="danger">Moderator note: {d.review_notes}</Notice> : null}
          {cat?.is_sensitive ? (
            <Notice tone="info">This category is reviewed by our team before it goes live, usually within a day. Only verified volunteers will see it.</Notice>
          ) : null}
          <form action={publishDraft} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <input type="hidden" name="base" value={base} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="detail" value={`${detailBase}/${id}`} />
            <Link href={`${base}?id=${id}&step=4`} className="text-sm font-medium text-primary">
              Back
            </Link>
            <Button type="submit" disabled={d.publish_problems.length > 0 || d.review_status === "pending_review"}>
              {cat?.is_sensitive ? "Submit for review" : "Publish request"}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label: l, value, edit }: { label: string; value: string; edit: string }) {
  return (
    <>
      <dt className="text-sm font-medium text-muted">{l}</dt>
      <dd className="m-0 flex items-start justify-between gap-3">
        <span className="whitespace-pre-line">{value}</span>
        <Link href={edit} className="shrink-0 text-sm text-primary">
          Edit<span className="sr-only"> {l.toLowerCase()}</span>
        </Link>
      </dd>
    </>
  );
}
