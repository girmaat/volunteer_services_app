import { forwardHeaders } from "../../lib/forward";
import styles from "../(auth)/auth.module.css";
import Link from "next/link";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function forgotAction(formData: FormData) {
  "use server";
  const payload = { email: String(formData.get("email") || "") };

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const email = encodeURIComponent(payload.email);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = encodeURIComponent(String(err?.message || "Request failed"));
    redirect(`/forgot-password?error=${msg}&email=${email}`);
  }

  const data = await res.json().catch(() => ({}));
  // Local development only: the API returns a reset link when DEV_EMAIL_LINKS=true and no email was sent.
  // It is carried in a short-lived httpOnly cookie, never in the URL (a URL param could be forged).
  const devLink = typeof data?.dev_reset_url === "string" ? data.dev_reset_url : "";
  if (devLink && process.env.NODE_ENV !== "production") {
    (await cookies()).set("ty_dev_link", devLink, { httpOnly: true, sameSite: "lax", path: "/forgot-password", maxAge: 120 });
  }
  redirect(`/forgot-password?sent=1&email=${email}`);
}

export default async function Page(
  props: { searchParams?: Promise<{ sent?: string; error?: string; email?: string }> }
) {
  const searchParams = await props.searchParams;
  const sent = searchParams?.sent === "1";
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : "";
  const resetUrl = process.env.NODE_ENV !== "production" ? (await cookies()).get("ty_dev_link")?.value || "" : "";

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Forgot password</h1>
        <p className={styles.subtitle}>We’ll email you a reset link.</p>
      </header>

      <div className={styles.card}>
        {error ? <div className={styles.error}>{error}</div> : null}
        {sent ? (
          <div className={styles.success}>
            If an account exists for that email, a reset link has been sent.
            {resetUrl ? (
              <div className={styles.meta} style={{ marginTop: 12 }}>
                Development only — reset link: <a href={resetUrl}>{resetUrl}</a>
              </div>
            ) : null}
          </div>
        ) : (
          <form className={styles.form} action={forgotAction}>
            <label>
              <div className={styles.meta}>Email</div>
              <input className={styles.input} name="email" type="email" required />
            </label>

            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit">Send reset link</button>
              <Link className={styles.meta} href="/login">Back to log in</Link>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
