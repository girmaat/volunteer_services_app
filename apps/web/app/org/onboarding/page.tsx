import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { backendFetch, getCurrentUser, getOnboardingProfile } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { Button, Card, Notice } from "../../../components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finish setting up", robots: { index: false } };

const input = "h-11 w-full rounded border border-line-strong bg-surface px-3 text-base";
const label = "text-sm font-semibold text-ink";

function message(err: unknown, fallback: string) {
  const e = err as { message?: string; errors?: { fieldErrors?: Record<string, string[]> } } | null;
  const field = e?.errors?.fieldErrors ? Object.entries(e.errors.fieldErrors).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.join(", ")}`)[0] : null;
  return String(field || e?.message || fallback);
}

/** One step: confirm the contact person and the public profile, then go to Org Home. */
async function finishSetup(fd: FormData) {
  "use server";
  const s = (k: string) => String(fd.get(k) || "").trim();
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  const fail = (m: string) => redirect(`/org/onboarding?error=${encodeURIComponent(m)}`);
  if (!s("fullName")) fail("Add your name: volunteers see who’s organizing.");

  const p = await backendFetch("/v1/onboarding/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: s("fullName"), ...(s("phone") ? { phone: s("phone") } : {}) })
  });
  if (!p.ok) fail(message(await p.json().catch(() => null), "Your details didn’t save."));

  const website = s("website_url");
  const o = await backendFetch(`/v1/orgs/${encodeURIComponent(ctx.org.slug)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: s("name"),
      summary: s("summary"),
      location: s("location"),
      service_area: s("service_area") || null,
      mission: s("mission") || null,
      website_url: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
      onboarding_completed: true
    })
  });
  if (!o.ok) fail(message(await o.json().catch(() => null), "The organization profile didn’t save."));
  redirect("/org/dashboard?welcome=1");
}

export default async function OrgOnboardingPage(props: { searchParams?: Promise<{ error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const [user, ctx] = await Promise.all([getCurrentUser(), getOrgContext()]);
  if (!user) redirect("/login?returnTo=/org/onboarding");
  if (!ctx) redirect("/org/signup");
  if (ctx.org.onboarding_completed && !sp.error) redirect("/org/settings");
  const me = await getOnboardingProfile();
  const o = ctx.org;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">Last step</p>
      <h1 className="m-0 mt-2 font-display text-3xl font-bold">Finish setting up {o.name}</h1>
      <p className="m-0 mt-2 text-muted">Check how volunteers will see you. You can change any of this later in Organization settings.</p>
      {sp.error ? (
        <div className="mt-6">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}

      <form action={finishSetup} className="mt-6 grid gap-6">
        <Card className="grid gap-4 p-5 sm:p-6">
          <h2 className="m-0 text-lg font-semibold">Your public profile</h2>
          <div className="grid gap-1.5">
            <label htmlFor="o-name" className={label}>
              Organization name
            </label>
            <input id="o-name" name="name" required minLength={2} defaultValue={o.name} className={input} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="o-sum" className={label}>
              What you do
            </label>
            <input id="o-sum" name="summary" required minLength={10} maxLength={200} defaultValue={o.summary} className={input} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="o-loc" className={label}>
                City or area
              </label>
              <input id="o-loc" name="location" required minLength={2} defaultValue={o.location} className={input} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="o-area" className={label}>
                Neighborhoods you serve <span className="font-normal text-muted">(optional)</span>
              </label>
              <input id="o-area" name="service_area" defaultValue={o.service_area || ""} placeholder="e.g. Astoria, Long Island City" className={input} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="o-mission" className={label}>
              Mission <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea id="o-mission" name="mission" rows={3} maxLength={1000} defaultValue={o.mission || ""} className="w-full rounded border border-line-strong bg-surface px-3 py-2 text-base" />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="o-web" className={label}>
              Website <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="o-web" name="website_url" inputMode="url" defaultValue={o.website_url || ""} placeholder="example.org" className={input} />
          </div>
        </Card>

        <Card className="grid gap-4 p-5 sm:p-6">
          <h2 className="m-0 text-lg font-semibold">You, as the point of contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="o-you" className={label}>
                Your name
              </label>
              <input id="o-you" name="fullName" required autoComplete="name" defaultValue={me?.full_name || ""} className={input} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="o-phone" className={label}>
                Phone <span className="font-normal text-muted">(optional, never public)</span>
              </label>
              <input id="o-phone" name="phone" type="tel" autoComplete="tel" defaultValue={me?.phone || ""} className={input} />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg">
            Go to Org Home <ArrowRight aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
