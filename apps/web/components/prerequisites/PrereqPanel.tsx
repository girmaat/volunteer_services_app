import { CheckCircle2, Circle, FileText, ShieldAlert } from "lucide-react";
import { backendFetch } from "../../app/lib/backend";
import { guardianAction, signFormAction } from "../../app/_prereq/actions";
import { Card, SubmitButton } from "../ui";

type Item = { kind: "document" | "guardian" | "background_check"; id: string | null; label: string; required_before: "apply" | "check_in"; state: string; detail: string | null; version?: number; signed_version?: number | null };
type Pre = { status: "cleared" | "pending" | "blocked"; items: Item[]; application_id: string | null; guardian: { guardian_name: string; status: string } | null };

const field = "h-10 rounded border border-line-strong bg-surface px-3 text-sm";

/**
 * What a volunteer must do before applying or before their shift: sign forms (current version),
 * get a guardian's consent if they're under 18, and any background check. Check-in waits until
 * everything here is done.
 */
export default async function PrereqPanel({ requestId, back, stage }: { requestId: string; back: string; stage: "apply" | "assignment" }) {
  const res = await backendFetch(`/v1/volunteer/requests/${requestId}/prerequisites`);
  if (!res.ok) return null;
  const p = (await res.json()) as Pre;
  const items = stage === "apply" ? p.items.filter((i) => i.required_before === "apply" && i.kind === "document") : p.items;
  if (!items.length) return null;
  const done = items.every((i) => i.state === "done");
  return (
    <Card className="grid gap-3" id="prerequisites">
      <div>
        <h2 className="m-0 text-base font-semibold">{stage === "apply" ? "Before you apply" : "Before your shift"}</h2>
        <p className={`m-0 mt-1 text-sm ${p.status === "blocked" ? "text-danger" : "text-muted"}`}>
          {done ? "All done." : p.status === "blocked" && stage !== "apply" ? "Something changed. Check-in is blocked until you finish the items below." : stage === "apply" ? "This organization asks you to sign these first." : "Finish these so you can check in."}
        </p>
      </div>
      <ul className="m-0 grid gap-3 p-0">
        {items.map((i) => (
          <li key={`${i.kind}-${i.id ?? ""}`} className="list-none">
            <p className="m-0 flex items-start gap-2 text-sm">
              {i.state === "done" ? <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : i.state === "stale" || i.state === "declined" || i.state === "expired" ? <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> : <Circle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
              <span>
                <span className="font-medium">{i.label}</span>
                {i.state === "done" ? <span className="text-muted">{i.kind === "document" ? ` · signed v${i.signed_version}` : " · done"}</span> : null}
                {i.detail ? <span className="block text-muted">{i.detail}</span> : null}
                {i.kind === "background_check" && i.state !== "done" ? <span className="block text-muted">Add a cleared background check in your profile, or ask the organizer how to get one.</span> : null}
              </span>
            </p>
            {i.kind === "document" && i.id && i.state !== "done" ? (
              <form action={signFormAction.bind(null, requestId, i.id, back)} className="ml-6 mt-2 grid gap-2 rounded-md border border-line p-3">
                <a href={`/volunteer/documents/${i.id}/download?requestId=${requestId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  <FileText aria-hidden className="h-4 w-4" /> Read the form (version {i.version})
                </a>
                <label className="grid gap-1 text-sm font-medium">
                  Type your full name to sign
                  <input name="signer_name" required minLength={2} maxLength={120} autoComplete="name" className={field} />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="agree" value="yes" required className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />I’ve read this form and agree to it.
                </label>
                <div>
                  <SubmitButton size="sm">Sign</SubmitButton>
                </div>
              </form>
            ) : null}
            {i.kind === "guardian" && i.state !== "done" && p.application_id ? (
              <form action={guardianAction.bind(null, p.application_id)} className="ml-6 mt-2 grid gap-2 rounded-md border border-line p-3">
                <p className="m-0 text-sm text-muted">Because you’re under 18, a parent or guardian needs to say yes. We’ll email them a link with the details.</p>
                <label className="grid gap-1 text-sm font-medium">
                  Their name
                  <input name="guardianName" required minLength={2} maxLength={120} className={field} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Their email
                  <input name="guardianEmail" type="email" required maxLength={200} className={field} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  They are your
                  <select name="relationship" className={field} defaultValue="parent">
                    <option value="parent">Parent</option>
                    <option value="legal_guardian">Legal guardian</option>
                  </select>
                </label>
                <div>
                  <SubmitButton size="sm">{i.state === "requested" || i.state === "declined" ? "Send a new request" : "Ask for consent"}</SubmitButton>
                </div>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
