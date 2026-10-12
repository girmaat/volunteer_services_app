import { API_BASE_URL_SERVER } from "@thankyou/config";
import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Button, Card, Notice } from "../../../../components/ui";
import { formatInZone, zoneOr } from "../../../../lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parent or guardian consent", robots: { index: false, follow: false } };

type Consent = {
  state: "pending" | "granted" | "declined" | "expired";
  guardian_name: string;
  volunteer_first_name: string;
  title: string;
  description: string;
  starts_at: string | null;
  timezone: string | null;
  mode: string;
  public_area: string | null;
  min_age: number | null;
  accessibility_notes: string | null;
  equipment_notes: string | null;
  org_name: string | null;
  org_verified: boolean;
};

async function respond(token: string, fd: FormData) {
  "use server";
  const decision = fd.get("decision") === "decline" ? "decline" : "grant";
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/public/guardian-consents/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, signedName: String(fd.get("signedName") || "").trim(), confirmGuardian: fd.get("confirm") === "yes" }),
    cache: "no-store"
  });
  const body = (await r.json().catch(() => null)) as { message?: string } | null;
  redirect(`/guardian/consent/${encodeURIComponent(token)}?${r.ok ? "done=1" : `error=${encodeURIComponent(body?.message || "That didn’t go through. Try again.")}`}`);
}

/** A parent or guardian reads what their teenager signed up for and gives or declines consent (FORM-03). No account needed. */
export default async function GuardianConsentPage(props: { params: Promise<{ token: string }>; searchParams?: Promise<{ error?: string; done?: string }> }) {
  const { token } = await props.params;
  const sp = (await props.searchParams) || {};
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/guardian-consents/${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
  const c = res && res.ok ? ((await res.json()) as Consent) : null;

  if (!c) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="m-0 font-display text-3xl font-bold">This link isn’t valid</h1>
        <p className="m-0 mt-2 text-lg text-muted">It may have been replaced by a newer request. Ask your teenager to send it again from ThankYou.</p>
      </main>
    );
  }
  const answered = c.state === "granted" || c.state === "declined";
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <p className="m-0 flex items-center gap-2 text-sm font-semibold text-primary">
        <ShieldCheck aria-hidden className="h-5 w-5" /> Parent or guardian consent
      </p>
      <h1 className="m-0 mt-2 font-display text-3xl font-bold">
        {c.volunteer_first_name} would like to volunteer with {c.org_name ?? "a local organization"}
      </h1>
      {sp.error ? (
        <div className="mt-5">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      {answered ? (
        <div className="mt-6 flex items-start gap-3 rounded-md border border-line bg-surface p-5">
          {c.state === "granted" ? <CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-success" /> : <XCircle aria-hidden className="h-6 w-6 shrink-0 text-danger" />}
          <p className="m-0 text-lg">
            {c.state === "granted" ? `Thank you. You gave consent for “${c.title}”.` : `You declined consent for “${c.title}”.`} {c.volunteer_first_name} and the organizer have been told.
          </p>
        </div>
      ) : c.state === "expired" ? (
        <p className="m-0 mt-4 text-lg text-muted">This request has expired. Ask {c.volunteer_first_name} to send a new one.</p>
      ) : (
        <>
          <Card className="mt-6 grid gap-2 p-5">
            <h2 className="m-0 text-lg font-semibold">{c.title}</h2>
            <p className="m-0 text-sm text-muted">
              {c.org_name}
              {c.org_verified ? " · verified organization" : ""}
              {c.starts_at ? ` · ${formatInZone(c.starts_at, zoneOr(c.timezone), { withZone: true })}` : ""}
              {` · ${c.mode === "remote" ? "Remote" : c.public_area || "In person"}`}
            </p>
            <p className="m-0 whitespace-pre-line">{c.description}</p>
            {c.equipment_notes ? <p className="m-0 text-sm"><span className="font-medium">What to bring:</span> {c.equipment_notes}</p> : null}
            {c.accessibility_notes ? <p className="m-0 text-sm"><span className="font-medium">Accessibility:</span> {c.accessibility_notes}</p> : null}
            <p className="m-0 text-sm text-muted">Messages with your teenager happen only in this opportunity’s thread on ThankYou, which the organization’s staff can see, and phone numbers and email addresses are hidden in it.</p>
          </Card>
          <form action={respond.bind(null, token)} className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold">
              Your full name
              <input name="signedName" required minLength={2} maxLength={120} autoComplete="name" defaultValue={c.guardian_name} className="h-11 rounded border border-line-strong bg-surface px-3 text-base font-normal" />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />I am {c.volunteer_first_name}’s parent or legal guardian.
            </label>
            <p className="m-0 text-xs text-muted">This records your consent for this opportunity only. It isn’t a legal review of any waiver the organization uses.</p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" name="decision" value="grant" size="lg">
                I give consent
              </Button>
              <Button type="submit" name="decision" value="decline" variant="secondary" size="lg">
                I don’t consent
              </Button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
