import { FileText, Link2, Paperclip } from "lucide-react";
import { addEvidenceAction, removeEvidenceAction } from "../../app/_hours/evidence-actions";
import { SubmitButton } from "../ui";

export type EvidenceItem = { id: string; kind: "link" | "file"; url: string | null; label: string | null; file_name: string | null; mine?: boolean };

const field = "h-10 rounded border border-line-strong bg-surface px-3 text-sm font-normal";

/**
 * Evidence attached to a contribution (a link or a file). Files download through this site, so the
 * API's access rules apply. With `back`, it also offers adding evidence and removing your own.
 */
export default function Evidence({ contributionId, items, back, canAdd }: { contributionId: string; items: EvidenceItem[]; back?: string; canAdd?: boolean }) {
  if (!items.length && !canAdd) return null;
  return (
    <div className="mt-2 text-sm">
      {items.length ? (
        <ul className="m-0 grid gap-1 p-0" aria-label="Evidence">
          {items.map((e) => (
            <li key={e.id} className="flex list-none flex-wrap items-center gap-2">
              {e.kind === "link" ? <Link2 aria-hidden className="h-4 w-4 text-muted" /> : <FileText aria-hidden className="h-4 w-4 text-muted" />}
              {e.kind === "link" && e.url ? (
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">
                  {e.label || e.url}
                </a>
              ) : (
                <a href={`/hours/evidence/${contributionId}/${e.id}`} className="text-primary underline">
                  {e.label || e.file_name || "File"}
                </a>
              )}
              {back && canAdd && e.mine ? (
                <form action={removeEvidenceAction.bind(null, contributionId, e.id, back)}>
                  <SubmitButton size="sm" variant="ghost">
                    Remove
                  </SubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {back && canAdd ? (
        <details className="mt-1">
          <summary className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary">
            <Paperclip aria-hidden className="h-4 w-4" /> Add evidence
          </summary>
          <form action={addEvidenceAction.bind(null, contributionId, back)} className="mt-2 grid max-w-xl gap-2 rounded-md border border-line p-3">
            <p className="m-0 text-xs text-muted">A link (photos, a sign-in sheet) or a file: PDF, image or Word document up to 5 MB.</p>
            <label className="grid gap-1 font-medium">
              Link
              <input name="url" type="url" placeholder="https://" className={field} />
            </label>
            <label className="grid gap-1 font-medium">
              or a file
              <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt" className="text-sm font-normal" />
            </label>
            <label className="grid gap-1 font-medium">
              Label <span className="font-normal text-muted">(optional)</span>
              <input name="label" maxLength={120} className={field} placeholder="e.g. Sign-in sheet" />
            </label>
            <div>
              <SubmitButton size="sm" variant="secondary">
                Add
              </SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
