import { reviewAction } from "../../app/_requests/applicant-actions";
import { Button } from "../ui";
import type { ReviewState } from "@volunteer_services_app/contracts";

export type { ReviewState };

function Stars({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return (
    <fieldset className="m-0 grid gap-1 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-medium">
        {label}
        {required ? "" : <span className="font-normal text-muted"> (optional)</span>}
      </legend>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((v) => (
          <label key={v} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-line-strong text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
            <input type="radio" name={name} value={v} required={required && v === 1} className="sr-only" />
            {v}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

/** Double-blind review: write yours; theirs appears when both are in or after 14 days. */
export default function ReviewPanel({ applicationId, back, state, otherName }: { applicationId: string; back: string; state: ReviewState; otherName: string }) {
  const action = reviewAction.bind(null, back, applicationId);
  const specific = state.side === "owner" ? { name: "skill", label: "Skill for the task" } : { name: "clarity", label: "Clear instructions" };
  return (
    <section id={`review-${applicationId}`} aria-label={`Review of ${otherName}`} className="grid gap-3 rounded-md border border-line bg-surface p-4">
      <h3 className="m-0 text-base">Review {otherName}</h3>
      {state.mine ? (
        <p className="m-0 text-sm text-muted">
          You rated {String(state.mine.overall)}/5.{" "}
          {state.theirs ? "Both reviews are published." : `Published when ${otherName} reviews you${state.reveal_at ? ` or on ${fmt(state.reveal_at)}` : ""}.`}
        </p>
      ) : null}
      {state.can_review ? (
        <form action={action} className="grid gap-3">
          <Stars name="overall" label="Overall" required />
          <div className="grid gap-3 sm:grid-cols-3">
            <Stars name="reliability" label="Reliability" />
            <Stars name="communication" label="Communication" />
            <Stars name={specific.name} label={specific.label} />
          </div>
          <label className="grid gap-1 text-sm font-medium">
            Comment <span className="font-normal text-muted">(optional, public)</span>
            <textarea name="comment" maxLength={2000} className="min-h-[70px] rounded border border-line-strong bg-surface px-3 py-2 font-normal" />
          </label>
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0 text-sm">
            <legend className="mb-1 p-0 font-medium">Work together again?</legend>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="again" value="yes" className="accent-[var(--primary)]" /> Yes
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="again" value="no" className="accent-[var(--primary)]" /> No
            </label>
          </fieldset>
          <p className="m-0 text-xs text-muted">Reviews stay hidden until you both submit (or 14 days pass), then they can&apos;t be edited.</p>
          <div>
            <Button type="submit" size="sm">
              {state.mine ? "Update review" : "Submit review"}
            </Button>
          </div>
        </form>
      ) : null}
      {state.theirs ? (
        <div className="rounded border border-line bg-[var(--muted-bg)] px-3 py-2 text-sm">
          <p className="m-0 font-medium">
            {otherName}&apos;s review of you: {state.theirs.overall}/5
          </p>
          {state.theirs.comment ? <p className="m-0 mt-1">&ldquo;{state.theirs.comment}&rdquo;</p> : null}
        </div>
      ) : state.theirs_submitted ? (
        <p className="m-0 text-sm text-muted">{otherName} has reviewed you. You&apos;ll see it once yours is in.</p>
      ) : null}
    </section>
  );
}
