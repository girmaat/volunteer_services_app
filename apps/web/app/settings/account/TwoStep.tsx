"use client";

import { useActionState } from "react";
import QrCode from "../../_components/share/QrCode";
import { Notice, SubmitButton } from "../../../components/ui";
import { twoStepAction, type TwoStepState } from "./mfa-actions";

const input = "h-11 w-full rounded border border-line-strong bg-surface px-3";

/** Settings → Account: turn two-step sign-in on (scan, confirm, save recovery codes) or off. */
export default function TwoStep({ enabled, required }: { enabled: boolean; required: boolean }) {
  const [state, action] = useActionState<TwoStepState, FormData>(twoStepAction, { view: "idle" });
  const on = state.view === "idle" && state.done ? state.done === "on" : enabled;

  if (state.view === "scan") {
    // A short otpauth link keeps the QR small enough to scan easily.
    const uri = `otpauth://totp/Volunteer%20Services?secret=${state.secret}&issuer=Volunteer%20Services`;
    return (
      <form action={action} className="grid gap-4">
        <input type="hidden" name="step" value="enable" />
        <ol className="m-0 grid gap-3 pl-5 text-sm">
          <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and scan this code.</li>
          <li>
            Can’t scan? Enter this key instead: <code className="break-all rounded bg-wash px-1.5 py-0.5 font-mono text-sm">{state.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </li>
          <li>Type the 6-digit code the app shows.</li>
        </ol>
        <div className="w-fit rounded-md border border-line bg-white p-3">
          <QrCode text={uri} size={184} title="QR code to add Volunteer Services to your authenticator app" />
        </div>
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        <div className="grid max-w-xs gap-1.5">
          <label htmlFor="mfa-code" className="text-sm font-semibold">
            6-digit code
          </label>
          <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className={input} />
        </div>
        <div>
          <SubmitButton>Turn on</SubmitButton>
        </div>
      </form>
    );
  }

  if (state.view === "codes") {
    return (
      <form action={action} className="grid gap-4">
        <input type="hidden" name="step" value="finish" />
        <Notice tone="success">Two-step sign-in is on. Other devices were signed out.</Notice>
        <p className="m-0 text-sm">
          Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone. <strong>They won’t be shown again.</strong>
        </p>
        <ul className="m-0 grid grid-cols-2 gap-2 rounded-md border border-line bg-wash p-4 font-mono text-sm sm:grid-cols-5" aria-label="Recovery codes">
          {state.codes.map((c) => (
            <li key={c} className="list-none">
              {c}
            </li>
          ))}
        </ul>
        <div>
          <SubmitButton variant="secondary">I saved them</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-3">
      {state.view === "idle" && state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.view === "idle" && state.done === "off" ? <Notice tone="info">Two-step sign-in is off.</Notice> : null}
      {on ? (
        <>
          <p className="m-0 text-sm">
            <strong>On.</strong> Signing in asks for a code from your authenticator app.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Turn it off</summary>
            <form action={action} className="mt-3 grid max-w-sm gap-3">
              <input type="hidden" name="step" value="disable" />
              {required ? <Notice tone="warning">Admin tools need two-step sign-in; they’ll close until you turn it back on.</Notice> : null}
              <label className="grid gap-1.5 text-sm font-semibold">
                Password
                <input name="password" type="password" autoComplete="current-password" required className={input} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                Code from your app (or a recovery code)
                <input name="code" autoComplete="one-time-code" required className={input} />
              </label>
              <div>
                <SubmitButton variant="secondary">Turn off</SubmitButton>
              </div>
            </form>
          </details>
        </>
      ) : (
        <form action={action} className="grid max-w-sm gap-3">
          <input type="hidden" name="step" value="setup" />
          <p className="m-0 text-sm text-muted">Adds a 6-digit code from your phone when you sign in, so a leaked password isn’t enough.</p>
          <label className="grid gap-1.5 text-sm font-semibold">
            Confirm your password to start
            <input name="password" type="password" autoComplete="current-password" required className={input} />
          </label>
          <div>
            <SubmitButton>Set up two-step sign-in</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
