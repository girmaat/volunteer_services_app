import { forwardHeaders } from "../../../lib/forward";
import Link from "next/link";
import { redirect } from "next/navigation";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import { Building2, Users } from "lucide-react";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { Button, Notice } from "../../../components/ui";
import OrgEnrollForm, { type OrgEnrollState } from "./OrgEnrollForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register your organization", alternates: { canonical: "/org/signup" } };

const input = "h-11 w-full rounded border border-line-strong bg-surface px-3 text-base";
const label = "text-sm font-semibold text-ink";

function message(err: unknown, fallback: string) {
  const e = err as { message?: string; error?: { message?: string }; errors?: { fieldErrors?: Record<string, string[]> } } | null;
  const field = e?.errors?.fieldErrors ? Object.values(e.errors.fieldErrors).flat()[0] : null;
  return String(field || e?.error?.message || e?.message || fallback);
}

/** Signed-in: start an organization from your existing account (your roles stay). */
async function createOrgAction(fd: FormData) {
  "use server";
  const s = (k: string) => String(fd.get(k) || "").trim();
  const res = await backendFetch("/v1/orgs/create", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify({ org: { name: s("name"), summary: s("summary"), location: s("location") }, admin: { fullName: s("fullName") || undefined, adultConfirmed: fd.get("adultConfirmed") === "yes" } }),
    cache: "no-store"
  });
  if (res.status === 401) redirect("/login?returnTo=/org/signup");
  if (!res.ok) redirect(`/org/signup?error=${encodeURIComponent(message(await res.json().catch(() => null), "We couldn’t create the organization."))}`);
  redirect("/org/onboarding");
}

async function joinOrgAction(fd: FormData) {
  "use server";
  const orgSlug = String(fd.get("orgSlug") || "")
    .trim()
    .replace(/^.*\/organizations\//, "");
  if (!orgSlug) redirect(`/org/signup?error=${encodeURIComponent("Paste the organization’s ThankYou address or name.")}`);
  const res = await backendFetch("/v1/orgs/join", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify({ orgSlug, adultConfirmed: fd.get("adultConfirmed") === "yes" }),
    cache: "no-store"
  });
  if (res.status === 401) redirect("/login?returnTo=/org/signup");
  if (!res.ok) redirect(`/org/signup?error=${encodeURIComponent(message(await res.json().catch(() => null), "We couldn’t send that request."))}`);
  redirect("/org/signup?requested=1");
}

/** Logged-out: create the organization and its first admin together; then verify the email. */
async function enrollAction(_prev: OrgEnrollState, fd: FormData): Promise<OrgEnrollState> {
  "use server";
  const values: Record<string, string> = {};
  for (const k of ["orgName", "orgSummary", "orgLocation", "adminFullName", "adminEmail"]) values[k] = String(fd.get(k) || "").trim();
  const password = String(fd.get("password") || "");
  if (password.length < 8) return { view: "form", values, error: "Choose a password with at least 8 characters." };
  if (fd.get("adultConfirmed") !== "yes") return { view: "form", values, error: "Confirm you’re 18 or older and allowed to act for the organization." };
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/orgs/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify({
      org: { name: values.orgName, summary: values.orgSummary, location: values.orgLocation },
      admin: { fullName: values.adminFullName, email: values.adminEmail.toLowerCase(), password, adultConfirmed: fd.get("adultConfirmed") === "yes" }
    }),
    cache: "no-store"
  });
  if (!res.ok) return { view: "form", values, error: message(await res.json().catch(() => null), "We couldn’t create the account. Try again.") };
  const data = (await res.json().catch(() => ({}))) as { dev_verify_url?: string };
  return { view: "sent", adminEmail: values.adminEmail, verifyUrl: data.dev_verify_url || "" };
}

export default async function Page(props: { searchParams?: Promise<{ error?: string; requested?: string }> }) {
  const sp = (await props.searchParams) || {};
  const user = await getCurrentUser();
  // Already in an organization: go there.
  if (user?.orgs?.length) redirect("/org/dashboard");

  return (
    <div className="mx-auto max-w-2xl">
      <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">For nonprofits and community groups</p>
      <h1 className="m-0 mt-2 font-display text-3xl font-bold">Register your organization</h1>
      <p className="m-0 mt-2 text-lg text-muted">Post volunteer opportunities, review applicants and track attendance. Free. Takes about two minutes.</p>
      {sp.error ? (
        <div className="mt-6">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      {sp.requested === "1" ? (
        <div className="mt-6">
          <Notice tone="success">Request sent. The organization’s admins will approve it, and you’ll get a notification.</Notice>
        </div>
      ) : null}

      <div className="mt-8">
        {user ? (
          <div className="grid gap-6">
            <form action={createOrgAction} className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
              <h2 className="m-0 flex items-center gap-2 text-lg font-semibold">
                <Building2 aria-hidden className="h-5 w-5 text-primary" /> Start a new organization
              </h2>
              <p className="m-0 -mt-2 text-sm text-muted">You’ll be its admin, signed in as {user.email}. Anything you already do on ThankYou stays as it is.</p>
              <div className="grid gap-1.5">
                <label htmlFor="c-name" className={label}>
                  Organization name
                </label>
                <input id="c-name" name="name" required minLength={2} autoComplete="organization" className={input} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="c-sum" className={label}>
                  What does it do?
                </label>
                <input id="c-sum" name="summary" required minLength={10} maxLength={200} placeholder="One sentence for search results" className={input} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="c-loc" className={label}>
                  City or area
                </label>
                <input id="c-loc" name="location" required minLength={2} placeholder="e.g. Queens, NY" className={input} />
              </div>
              {!user.display_name ? (
                <div className="grid gap-1.5">
                  <label htmlFor="c-you" className={label}>
                    Your name
                  </label>
                  <input id="c-you" name="fullName" required autoComplete="name" className={input} />
                </div>
              ) : null}
              <label htmlFor="c-adult" className="flex items-start gap-2 text-sm">
                <input id="c-adult" name="adultConfirmed" value="yes" type="checkbox" required className="mt-1 h-4 w-4" />
                <span>I’m 18 or older. Organization team members must be adults.</span>
              </label>
              <div>
                <Button type="submit" size="lg">
                  Create organization
                </Button>
              </div>
            </form>

            <form action={joinOrgAction} className="grid gap-3 rounded-lg border border-line bg-surface p-5 sm:p-6">
              <h2 className="m-0 flex items-center gap-2 text-lg font-semibold">
                <Users aria-hidden className="h-5 w-5 text-primary" /> Join your team’s organization
              </h2>
              <p className="m-0 -mt-1 text-sm text-muted">
                We’ll ask the organization’s admins to approve you. Or ask one of them to invite you from their Team page.
              </p>
              <div className="grid gap-1.5">
                <label htmlFor="j-slug" className={label}>
                  Organization’s ThankYou address
                </label>
                <input id="j-slug" name="orgSlug" required placeholder="e.g. thankyou.org/organizations/harbor-food-bank" className={input} />
              </div>
              <label htmlFor="j-adult" className="flex items-start gap-2 text-sm">
                <input id="j-adult" name="adultConfirmed" value="yes" type="checkbox" required className="mt-1 h-4 w-4" />
                <span>I’m 18 or older. Organization team members must be adults.</span>
              </label>
              <div>
                <Button type="submit" variant="secondary">
                  Ask to join
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <OrgEnrollForm action={enrollAction} />
        )}
      </div>

      <p className="m-0 mt-8 text-sm text-muted">
        Volunteering or asking for help as yourself?{" "}
        <Link prefetch={false} href={user ? "/onboarding" : "/signup"} className="font-medium text-primary">
          {user ? "Set up your personal account" : "Create a personal account"}
        </Link>
      </p>
    </div>
  );
}
