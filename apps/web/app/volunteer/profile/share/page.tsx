import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Link2, Link2Off, RefreshCw, Lock } from "lucide-react";
import { backendFetch } from "../../../lib/backend";
import { Card, Notice, PageHeader } from "../../../../components/ui";
import { Checkbox } from "../../../../components/ui/Controls";
import { SubmitButton } from "../../../../components/ui/SubmitButton";
import CopyLink from "../../../../components/records/CopyLink";
import SharedProfileView, { type SharedProfile } from "../../../../components/profile/SharedProfileView";

export const dynamic = "force-dynamic";

type ShareState = {
  link: { url: string; created_at: string; view_count: number; last_viewed_at: string | null } | null;
  settings: Record<Field, boolean>;
  can_share: boolean;
};
type Field = "show_name" | "show_location" | "show_about" | "show_total_hours" | "show_average_rating" | "show_reviews_count";

const FIELDS: { key: Field; label: string; hint?: string }[] = [
  { key: "show_name", label: "Name", hint: "Your display name. Off shows “A ThankYou volunteer”." },
  { key: "show_location", label: "Location", hint: "The general area on your profile, never your address." },
  { key: "show_about", label: "About", hint: "The “About you” text from your profile." },
  { key: "show_total_hours", label: "Total hours logged", hint: "Approved hours only." },
  { key: "show_average_rating", label: "Average rating" },
  { key: "show_reviews_count", label: "Reviews received" }
];

const FLASH: Record<string, string> = {
  created: "Link created. Copy it and send it to whoever needs it.",
  replaced: "New link created. The old link no longer works.",
  revoked: "Link turned off. Nobody can open your profile with it anymore.",
  saved: "Saved. Your link now shows what you picked."
};

async function newLink() {
  "use server";
  const had = ((await (await backendFetch("/v1/volunteer/profile-share")).json()) as ShareState).link;
  const r = await backendFetch("/v1/volunteer/profile-share", { method: "POST" });
  if (!r.ok) redirect(`/volunteer/profile/share?error=${encodeURIComponent("We couldn't create a link.")}`);
  revalidatePath("/volunteer/profile/share");
  redirect(`/volunteer/profile/share?flash=${had ? "replaced" : "created"}`);
}

async function revoke() {
  "use server";
  await backendFetch("/v1/volunteer/profile-share/revoke", { method: "POST" });
  redirect("/volunteer/profile/share?flash=revoked");
}

async function saveSettings(fd: FormData) {
  "use server";
  const body = Object.fromEntries(FIELDS.map((f) => [f.key, fd.get(f.key) === "on"]));
  const r = await backendFetch("/v1/volunteer/profile-share/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) redirect(`/volunteer/profile/share?error=${encodeURIComponent("We couldn't save that.")}`);
  redirect("/volunteer/profile/share?flash=saved#settings");
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export default async function ShareProfilePage(props: { searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const [s, pv] = await Promise.all([backendFetch("/v1/volunteer/profile-share"), backendFetch("/v1/volunteer/profile-share/preview")]);
  if (s.status === 401) redirect("/login?returnTo=/volunteer/profile/share");
  if (!s.ok) return <Notice tone="danger">Sharing settings couldn&apos;t load. Refresh to try again.</Notice>;
  const state = (await s.json()) as ShareState;
  const preview = pv.ok ? ((await pv.json()) as SharedProfile) : null;

  return (
    <>
      <PageHeader
        back={<Link prefetch={false} href="/volunteer/profile">← Profile</Link>}
        title="Share your profile"
        description="Your volunteer profile is private. Create a link to share it with a school, employer or organization. Only people with the link can see it, and you can turn it off any time."
      />
      {sp.flash && FLASH[sp.flash] ? (
        <div className="mb-4">
          <Notice tone="success">{FLASH[sp.flash]}</Notice>
        </div>
      ) : null}
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}

      {!state.can_share ? (
        <Notice tone="info">Profiles of volunteers under 18 can&apos;t be shared. Your hours and record are still kept in Impact.</Notice>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="grid content-start gap-6">
            <Card className="grid gap-3">
              <h2 className="m-0 inline-flex items-center gap-2 text-lg">
                <Link2 aria-hidden className="h-5 w-5 text-primary" /> Your share link
              </h2>
              {state.link ? (
                <>
                  <CopyLink url={state.link.url} label="Share link" />
                  <p className="m-0 text-xs text-muted">
                    Created {when(state.link.created_at)} · opened {state.link.view_count} time{state.link.view_count === 1 ? "" : "s"}
                    {state.link.last_viewed_at ? ` · last opened ${when(state.link.last_viewed_at)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <form action={newLink}>
                      <SubmitButton variant="secondary" icon={<RefreshCw aria-hidden className="h-4 w-4" />}>
                        Create a new link
                      </SubmitButton>
                    </form>
                    <form action={revoke}>
                      <SubmitButton variant="secondary" icon={<Link2Off aria-hidden className="h-4 w-4" />}>
                        Turn off sharing
                      </SubmitButton>
                    </form>
                  </div>
                  <p className="m-0 text-sm text-muted">A new link replaces this one: anyone with the old link loses access straight away.</p>
                </>
              ) : (
                <>
                  <p className="m-0 inline-flex items-center gap-2 text-sm text-muted">
                    <Lock aria-hidden className="h-4 w-4" /> No active link. Nobody can see your profile.
                  </p>
                  <form action={newLink}>
                    <SubmitButton icon={<Link2 aria-hidden className="h-4 w-4" />}>Create a share link</SubmitButton>
                  </form>
                </>
              )}
            </Card>

            {preview ? (
              <section aria-labelledby="preview-h" className="grid gap-3">
                <h2 id="preview-h" className="m-0 text-base text-muted">
                  Preview: what people with your link see
                </h2>
                <Card>
                  <SharedProfileView p={preview} />
                </Card>
              </section>
            ) : null}
          </div>

          <aside id="settings">
            <Card className="grid gap-3">
              <h2 className="m-0 text-lg">What your link shows</h2>
              <p className="m-0 text-sm text-muted">Your accomplishments (completed opportunities and badges) always show. Pick which personal details to add.</p>
              <form action={saveSettings} className="grid gap-3">
                {FIELDS.map((f) => (
                  <Checkbox key={f.key} id={f.key} name={f.key} label={f.label} hint={f.hint} defaultChecked={state.settings[f.key]} />
                ))}
                <div>
                  <SubmitButton>Save</SubmitButton>
                </div>
              </form>
              <p className="m-0 text-xs text-muted">Your email, phone number and address are never shown.</p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
