"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import styles from "../(auth)/auth.module.css";

export type SignupState = {
  view: "signup" | "sent";
  email?: string;
  delivery?: string;
  verifyUrl?: string;
  error?: string;
  info?: string;
};

type ServerAction = (prevState: SignupState, formData: FormData) => Promise<SignupState>;

function SubmitButton({ children, secondary }: { children: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  const className = secondary ? `${styles.button} ${styles.secondary}` : styles.button;

  return (
    <button className={className} type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Working…" : children}
    </button>
  );
}

export default function SignupForm({ action }: { action: ServerAction }) {
  const initialState: SignupState = useMemo(() => ({ view: "signup" }), []);
  const [state, formAction] = useActionState(action, initialState);

  const [email, setEmail] = useState("");

  useEffect(() => {
    if (typeof state.email === "string") setEmail(state.email);
  }, [state.email]);

  const sent = state.view === "sent";
  const verifyUrl = String(state.verifyUrl || "").trim();
  const error = String(state.error || "").trim();
  const info = String(state.info || "").trim();

  return (
    <>
      {error ? <div className={styles.error}>{error}</div> : null}
      {info && !error ? <div className={styles.success}>{info}</div> : null}

      {sent ? (
        <>
          <div className={styles.success}>
            Check your inbox for a verification email to finish creating your account.
          </div>

          {verifyUrl ? (
            <div className={`${styles.meta} mt-3 [overflow-wrap:anywhere]`}>
              Development only — verification link: <a href={verifyUrl}>{verifyUrl}</a>
            </div>
          ) : (
            <div className={`${styles.meta} mt-3`}>
              Didn&apos;t get it? Check spam, or use <strong>Resend verification</strong>.
            </div>
          )}

          <form className={styles.form} action={formAction}>
            <input type="hidden" name="intent" value="resend" />
            <input type="hidden" name="email" value={email} />
            <div className={styles.meta}>Didn’t receive the email?</div>
            <div className={styles.buttonRow}>
              <SubmitButton secondary>Resend verification</SubmitButton>
              <Link prefetch={false} className={styles.meta} href="/login">
                Go to log in
              </Link>
            </div>
          </form>
        </>
      ) : (
        <form className={styles.form} action={formAction}>
          <input type="hidden" name="intent" value="signup" />

          <label>
            <div className={styles.meta}>Email</div>
            <input
              className={styles.input}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            <div className={styles.meta}>Password (min 8 chars)</div>
            <input
              className={styles.input}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label>
            <div className={styles.meta}>Confirm password</div>
            <input
              className={styles.input}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <div className={styles.buttonRow}>
            <SubmitButton>Create account</SubmitButton>
            <Link prefetch={false} className={styles.meta} href="/login">
              Already have an account?
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
