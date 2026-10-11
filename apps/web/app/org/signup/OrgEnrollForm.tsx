"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import authStyles from "../../(auth)/auth.module.css";
import styles from "./page.module.css";

export type OrgEnrollState = {
  view: "form" | "sent";
  orgName?: string;
  orgSlug?: string;
  adminEmail?: string;
  delivery?: string;
  verifyUrl?: string;
  error?: string;
  info?: string;
};

type ServerAction = (prevState: OrgEnrollState, formData: FormData) => Promise<OrgEnrollState>;

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={authStyles.button} type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Working..." : children}
    </button>
  );
}

export default function OrgEnrollForm({ action }: { action: ServerAction }) {
  const [state, formAction] = useFormState(action, { view: "form" });

  if (state.view === "sent") {
    return (
      <div className={styles.stack}>
        <p className={styles.success}>Account created. Please verify your email to continue.</p>
        {state.info ? <p className={styles.note}>{state.info}</p> : null}

        {state.delivery ? (
          <p className={styles.note}>
            Delivery: <strong>{state.delivery}</strong>
          </p>
        ) : null}

        {state.verifyUrl ? (
          <p className={styles.note}>
            Dev verify URL:{" "}
            <a className={styles.link} href={state.verifyUrl}>
              {state.verifyUrl}
            </a>
          </p>
        ) : null}

        <p className={styles.note}>
          Already verified? <Link className={styles.link} href="/login">Log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.stack}>
      {state.error ? <p className={styles.error}>{state.error}</p> : null}

      <div className={styles.card}>
        <h2 className={styles.h2}>Create an organization</h2>

        <label className={styles.field}>
          Organization name
          <input name="orgName" required minLength={2} defaultValue={state.orgName || ""}  className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Organization slug (URL-friendly)
          <input
            name="orgSlug"
            required
            minLength={2}
            placeholder="e.g. city-food-bank"
            defaultValue={state.orgSlug || ""}
           className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Summary
          <textarea name="orgSummary" required minLength={10} rows={3}  className={authStyles.textarea} />
        </label>

        <label className={styles.field}>
          Location
          <input name="orgLocation" required minLength={2} placeholder="City, State"  className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Contact email (used for domain-based joins)
          <input name="orgContactEmail" type="email" required  className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Website URL (optional)
          <input name="orgWebsiteUrl" type="url" placeholder="https://example.org"  className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Mission (optional)
          <input name="orgMission"  className={authStyles.input} />
        </label>
      </div>

      <div className={styles.card}>
        <h2 className={styles.h2}>Admin account</h2>

        <label className={styles.field}>
          Full name
          <input name="adminFullName" required minLength={2}  className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Admin email
          <input name="adminEmail" type="email" required defaultValue={state.adminEmail || ""}  className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Password
          <input name="password" type="password" required minLength={8}  className={authStyles.input} />
        </label>

        <label className={styles.field}>
          Confirm password
          <input name="confirmPassword" type="password" required minLength={8}  className={authStyles.input} />
        </label>

        <div className={styles.submitRow}>
          <SubmitButton>Create org account</SubmitButton>
          <p className={styles.note}>
            Already have an account? <Link className={styles.link} href="/login">Log in</Link>
          </p>
        </div>
      </div>
    </form>
  );
}
