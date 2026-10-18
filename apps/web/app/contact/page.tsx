import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LifeBuoy, Mail, MessageSquare, Siren } from "lucide-react";
import { backendFetch, getCurrentUser } from "../lib/backend";
import { Card, Notice } from "../../components/ui/Card";
import { SubmitButton } from "../../components/ui/SubmitButton";

export const metadata: Metadata = { title: "Contact us", alternates: { canonical: "/contact" } };
export const dynamic = "force-dynamic";

async function submitContact(formData: FormData) {
  "use server";
  // For signed-in people the API takes name and email from the account, whatever the form says.
  const res = await backendFetch("/v1/public/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      message: String(formData.get("message") || ""),
      website: String(formData.get("website") || "")
    })
  });
  if (!res.ok) redirect(`/contact?error=${encodeURIComponent("Please fill in every field with a valid email address.")}`);
  redirect("/contact?sent=1");
}

async function messageTeam(formData: FormData) {
  "use server";
  const body = String(formData.get("body") || "").trim();
  if (!body) redirect(`/contact?error=${encodeURIComponent("Write a message first.")}#team`);
  const res = await backendFetch("/v1/inbox/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
  const data = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || !data?.id) redirect(`/contact?error=${encodeURIComponent(data?.message || "We couldn't send that. Try the form below.")}`);
  redirect(`/inbox/${data!.id}`);
}

const inputCls = "h-11 w-full rounded border border-line-strong bg-surface px-3";
const readOnlyCls = "h-11 w-full cursor-not-allowed rounded border border-line bg-wash px-3 text-muted";

export default async function Page(props: { searchParams?: Promise<{ sent?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser();
  const isOrgMember = Boolean(me?.orgs?.length);
  const name = me ? me.display_name || me.email.split("@")[0] : "";

  return (
    <div className="mx-auto grid max-w-5xl gap-8 py-6">
      <header className="grid gap-2">
        <h1 className="m-0 text-3xl">Contact us</h1>
        <p className="m-0 max-w-2xl text-muted">
          Questions, feedback or a problem with the site? Send us a note and a member of the ThankYou team will reply by email, usually within two business days.
        </p>
      </header>

      {sp.sent ? <Notice tone="success">Thanks, your message is on its way. We&apos;ll reply to {me ? me.email : "the email address you gave"}.</Notice> : null}
      {sp.error ? <Notice tone="danger">{sp.error}</Notice> : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="grid content-start gap-6">
          {isOrgMember ? (
            <Card id="team" className="grid gap-3 border-primary">
              <h2 className="m-0 inline-flex items-center gap-2 text-lg">
                <MessageSquare aria-hidden className="h-5 w-5 text-primary" /> Message the ThankYou team
              </h2>
              <p className="m-0 text-sm text-muted">
                As an organization member you can talk with us in ThankYou messages instead of email. Your conversation stays in your Inbox.
              </p>
              <form action={messageTeam} className="grid gap-3">
                <label htmlFor="team-body" className="sr-only">
                  Message
                </label>
                <textarea id="team-body" name="body" required maxLength={5000} placeholder="How can we help your organization?" className="min-h-[110px] w-full rounded border border-line-strong bg-surface px-3 py-2" />
                <div>
                  <SubmitButton>Send message</SubmitButton>
                </div>
              </form>
            </Card>
          ) : null}

          <Card className="grid gap-4">
            <h2 className="m-0 inline-flex items-center gap-2 text-lg">
              <Mail aria-hidden className="h-5 w-5 text-primary" /> {isOrgMember ? "Or send an email message" : "Send us a message"}
            </h2>
            <form action={submitContact} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Your name
                  <input name="name" required maxLength={120} defaultValue={name} readOnly={Boolean(me)} aria-readonly={Boolean(me)} className={me ? readOnlyCls : inputCls} autoComplete="name" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Your email
                  <input name="email" type="email" required maxLength={254} defaultValue={me?.email ?? ""} readOnly={Boolean(me)} aria-readonly={Boolean(me)} className={me ? readOnlyCls : inputCls} autoComplete="email" />
                </label>
              </div>
              {me ? (
                <p className="m-0 -mt-2 text-xs text-muted">
                  These come from your account. To change them, go to <Link prefetch={false} href="/settings/account" className="text-primary underline">Settings</Link>.
                </p>
              ) : null}
              {/* Honeypot for bots; hidden from people and screen readers. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
              <label className="grid gap-1.5 text-sm font-medium">
                Message
                <textarea name="message" required maxLength={5000} placeholder="How can we help?" className="min-h-[140px] w-full rounded border border-line-strong bg-surface px-3 py-2 font-normal" />
              </label>
              <div>
                <SubmitButton>Send</SubmitButton>
              </div>
            </form>
          </Card>
        </div>

        <aside className="grid content-start gap-4">
          <Card className="grid gap-2 border-danger bg-danger-tint">
            <h2 className="m-0 inline-flex items-center gap-2 text-base">
              <Siren aria-hidden className="h-4 w-4 text-danger" /> In an emergency
            </h2>
            <p className="m-0 text-sm">If someone is in danger, call 911 (or your local emergency number) first. This form isn&apos;t watched around the clock.</p>
          </Card>
          <Card className="grid gap-2">
            <h2 className="m-0 inline-flex items-center gap-2 text-base">
              <LifeBuoy aria-hidden className="h-4 w-4 text-primary" /> Quick answers
            </h2>
            <ul className="m-0 grid gap-1.5 pl-5 text-sm">
              <li>
                <Link prefetch={false} href="/help" className="text-primary underline">Help center</Link>
              </li>
              <li>
                <Link prefetch={false} href="/how-it-works" className="text-primary underline">How ThankYou works</Link>
              </li>
              <li>
                <Link prefetch={false} href="/trust-safety" className="text-primary underline">Trust &amp; safety</Link>
              </li>
              <li>To report a person or a message, use <span className="font-medium">Report</span> on their profile or in the conversation.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
