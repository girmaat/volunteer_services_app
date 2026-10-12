import nodemailer from "nodemailer";

export type EmailDelivery = "smtp" | "logged" | "disabled" | "failed";

type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML part (always send `text` too). */
  html?: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** A calendar invitation (REQUEST) or cancellation (CANCEL) the mail client can apply (CAL-02). */
  icalEvent?: { method: "REQUEST" | "CANCEL" | "PUBLISH"; content: string; filename?: string };
};

function isTruthy(v: string | undefined) {
  if (!v) return false;
  return ["1", "true", "yes", "y", "on"].includes(v.toLowerCase());
}

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Transport selection (EMAIL_TRANSPORT):
 * - "smtp": send through SMTP_HOST/SMTP_PORT (required in production).
 * - "log" (default outside production): print the email to the server console; nothing is sent.
 * - "disabled": drop the email.
 * Legacy EMAIL_ENABLED=true is treated as "smtp".
 */
function transportMode(): "smtp" | "log" | "disabled" {
  const t = (process.env.EMAIL_TRANSPORT || "").toLowerCase();
  if (t === "smtp" || isTruthy(process.env.EMAIL_ENABLED)) return "smtp";
  if (t === "disabled" || t === "none" || t === "off") return "disabled";
  return isProduction() ? "smtp" : "log";
}

export async function sendEmail({ to, subject, text, html, headers, icalEvent }: SendEmailArgs): Promise<{ delivery: EmailDelivery; error?: string }> {
  const mode = transportMode();

  if (mode === "disabled") return { delivery: "disabled" };

  if (mode === "log") {
    // eslint-disable-next-line no-console
    console.log(`\n[email:log] To: ${to}\n[email:log] Subject: ${subject}\n${text}\n${icalEvent ? `[email:log] + calendar ${icalEvent.method}\n` : ""}[email:log] ---\n`);
    return { delivery: "logged" };
  }

  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const from = process.env.SMTP_FROM;
  if (!host || !portRaw || !from) {
    // eslint-disable-next-line no-console
    console.error("[email] SMTP is not configured (SMTP_HOST, SMTP_PORT, SMTP_FROM); email not sent");
    return { delivery: "failed", error: "smtp_not_configured" };
  }

  const port = Number(portRaw);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined
    });
    await transporter.sendMail({ from, to, subject, text, html, headers, ...(icalEvent ? { icalEvent: { method: icalEvent.method, content: icalEvent.content, filename: icalEvent.filename ?? "invite.ics" } } : {}) });
    return { delivery: "smtp" };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[email] delivery failed", e instanceof Error ? e.message : e);
    return { delivery: "failed", error: "smtp_failed" };
  }
}

/**
 * Verification and password-reset links may be returned to the browser ONLY for local development,
 * and only when explicitly enabled. Returning them in production would let anyone take over an
 * account whenever email delivery fails.
 */
export function devEmailLink(url: string, delivery: EmailDelivery): string | undefined {
  if (isProduction()) return undefined;
  if (!isTruthy(process.env.DEV_EMAIL_LINKS)) return undefined;
  return delivery === "smtp" ? undefined : url;
}
