import styles from "../(auth)/auth.module.css";
import Link from "next/link";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function forgotAction(formData: FormData) {
  "use server";
  const payload = { email: String(formData.get("email") || "") };

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  const reset = encodeURIComponent(String(data?.dev_reset_url || ""));
  const delivery = encodeURIComponent(String(data?.emailDelivery || ""));
  redirect(`/forgot-password?sent=1&email=${email}&reset=${reset}&delivery=${delivery}`);
}

export default async function Page(
  props: { searchParams?: Promise<{ sent?: string; error?: string; email?: string; reset?: string; delivery?: string }> }
) {
  const searchParams = await props.searchParams;
  const sent = searchParams?.sent === "1";
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : "";
  const resetUrl = searchParams?.reset ? decodeURIComponent(searchParams.reset) : "";
  const delivery = searchParams?.delivery ? decodeURIComponent(searchParams.delivery) : "";

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
            {delivery === "smtp" ? "If an account exists for that email, a reset link has been sent." : "If an account exists for that email, email sending is disabled for now. Use the reset link below."}
          
            {resetUrl ? (
              <div className={styles.meta} style={{ marginTop: 12 }}>
                Reset link: <a href={resetUrl}>{resetUrl}</a>
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
