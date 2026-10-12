import { forwardHeaders } from "../../lib/forward";
import styles from "../(auth)/auth.module.css";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import SignupForm, { type SignupState } from "./SignupForm";

export const metadata = { title: "Create an account", alternates: { canonical: "/signup" } };

export const dynamic = "force-dynamic";

type ActionIntent = "signup" | "resend";

function safeMessage(err: any, fallback: string) {
  const msg = String(err?.message || "").trim();
  return msg ? msg : fallback;
}

async function signupOrResendAction(prevState: SignupState, formData: FormData): Promise<SignupState> {
  "use server";

  const intent = (String(formData.get("intent") || "signup") as ActionIntent) || "signup";
  const emailRaw = String(formData.get("email") || "");
  const email = emailRaw.trim().toLowerCase();

  if (!email) {
    return {
      view: prevState.view || "signup",
      error: "Email is required.",
      email: ""
    };
  }

  if (intent === "resend") {
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/auth/resend-verification`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await forwardHeaders()) },
      body: JSON.stringify({ email }),
      cache: "no-store"
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        view: "sent",
        email,
        error: safeMessage(err, "Resend failed")
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      view: "sent",
      email,
      delivery: String(data?.emailDelivery || ""),
      verifyUrl: String(data?.dev_verify_url || ""),
      info: "Verification sent (or re-sent) if the email needs verification."
    };
  }

  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 8) {
    return {
      view: "signup",
      email,
      error: "Password must be at least 8 characters."
    };
  }

  if (password !== confirmPassword) {
    return {
      view: "signup",
      email,
      error: "Passwords do not match."
    };
  }

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify({ email, password, birthDate: String(formData.get("birthDate") || "") }),
    cache: "no-store"
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      view: "signup",
      email,
      error: safeMessage(err, "Sign up failed")
    };
  }

  const data = await res.json().catch(() => ({}));
  return {
    view: "sent",
    email,
    delivery: String(data?.emailDelivery || ""),
    verifyUrl: String(data?.dev_verify_url || ""),
    info: "Account created. Please verify your email to continue."
  };
}

export default function Page() {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Sign up</h1>
        <p className={styles.subtitle}>
          Create an account with email + password. You&apos;ll choose volunteer/requester and finish your profile after verification.
        </p>
      </header>

      <div className={styles.card}>
        <SignupForm action={signupOrResendAction} />
      </div>
    </section>
  );
}
