"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MailCheck } from "lucide-react";
import { buttonClass } from "../../../components/ui/Button";

export type OrgEnrollState = {
  view: "form" | "sent";
  values?: Record<string, string>;
  adminEmail?: string;
  verifyUrl?: string;
  error?: string;
};

type ServerAction = (prevState: OrgEnrollState, formData: FormData) => Promise<OrgEnrollState>;

const input = "h-11 w-full rounded border border-line-strong bg-surface px-3 text-base";
const label = "text-sm font-semibold text-ink";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
      {pending ? "Creating…" : "Create organization account"}
    </button>
  );
}

/** Logged-out organization sign-up: the organization basics and your account, in one short form. */
export default function OrgEnrollForm({ action }: { action: ServerAction }) {
  const [state, formAction] = useActionState(action, { view: "form" });
  const v = state.values ?? {};

  if (state.view === "sent") {
    return (
      <div className="rounded-lg border border-line bg-surface p-6" role="status">
        <MailCheck aria-hidden className="h-7 w-7 text-primary" />
        <h2 className="m-0 mt-3 text-xl font-semibold">Check your email</h2>
        <p className="m-0 mt-2 text-muted">
          We sent a link to <strong className="text-ink">{state.adminEmail}</strong>. Open it to finish setting up your organization.
        </p>
        {state.verifyUrl ? (
          <p className="m-0 mt-4 break-all rounded bg-wash p-3 text-sm">
            Development only: <a href={state.verifyUrl}>verification link</a>
          </p>
        ) : null}
        <p className="m-0 mt-4 text-sm text-muted">
          Already verified?{" "}
          <Link prefetch={false} href="/login" className="font-medium text-primary">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-6">
      {state.error ? (
        <p role="alert" className="m-0 rounded border border-danger bg-danger-tint px-4 py-3 text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <fieldset className="m-0 grid gap-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-base font-semibold">Your organization</legend>
        <div className="grid gap-1.5">
          <label htmlFor="org-name" className={label}>
            Organization name
          </label>
          <input id="org-name" name="orgName" required minLength={2} defaultValue={v.orgName} autoComplete="organization" className={input} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="org-summary" className={label}>
            What does it do?
          </label>
          <input id="org-summary" name="orgSummary" required minLength={10} maxLength={200} defaultValue={v.orgSummary} placeholder="e.g. A neighborhood food pantry serving Queens families" className={input} aria-describedby="org-summary-hint" />
          <p id="org-summary-hint" className="m-0 text-sm text-muted">
            One sentence. It appears under your name in search results.
          </p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="org-loc" className={label}>
            City or area
          </label>
          <input id="org-loc" name="orgLocation" required minLength={2} defaultValue={v.orgLocation} placeholder="e.g. Queens, NY" className={input} />
        </div>
      </fieldset>

      <fieldset className="m-0 grid gap-4 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <legend className="px-1 text-base font-semibold">You</legend>
        <div className="grid gap-1.5">
          <label htmlFor="adm-name" className={label}>
            Your name
          </label>
          <input id="adm-name" name="adminFullName" required autoComplete="name" defaultValue={v.adminFullName} className={input} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="adm-email" className={label}>
            Work email
          </label>
          <input id="adm-email" name="adminEmail" type="email" required autoComplete="email" defaultValue={v.adminEmail} className={input} aria-describedby="adm-email-hint" />
          <p id="adm-email-hint" className="m-0 text-sm text-muted">
            You’ll sign in with this. Teammates with the same email domain can ask to join.
          </p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="adm-pass" className={label}>
            Password
          </label>
          <input id="adm-pass" name="password" type="password" required minLength={8} autoComplete="new-password" className={input} aria-describedby="adm-pass-hint" />
          <p id="adm-pass-hint" className="m-0 text-sm text-muted">
            At least 8 characters.
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="adultConfirmed" value="yes" required className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />
          <span>I’m 18 or older and allowed to act for this organization.</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-muted">
          Already have a ThankYou account?{" "}
          <Link prefetch={false} href="/login?returnTo=/org/signup" className="font-medium text-primary">
            Log in to add an organization
          </Link>
        </p>
        <Submit />
      </div>
    </form>
  );
}
