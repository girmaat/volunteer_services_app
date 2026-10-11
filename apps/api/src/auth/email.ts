import nodemailer from "nodemailer";

export type EmailDelivery = "smtp" | "disabled" | "failed";

type SendEmailArgs = {
  to: string;
  subject: string;
  text: string;
};

function isTruthy(v: string | undefined) {
  if (!v) return false;
  return ["1", "true", "yes", "y", "on"].includes(v.toLowerCase());
}


/**
 * Email is optional in this project right now.
 *
 * Behavior:
 * - Default (when EMAIL_ENABLED is unset): disabled (no SMTP attempt).
 * - If EMAIL_ENABLED=true or EMAIL_TRANSPORT=smtp: try SMTP.
 * - If SMTP is not configured or connection fails: do NOT throw; return delivery=failed.
 */
export async function sendEmail({ to, subject, text }: SendEmailArgs): Promise<{ delivery: EmailDelivery; error?: string }> {
  const transport = (process.env.EMAIL_TRANSPORT || "").toLowerCase();

  // Default to disabled unless explicitly enabled.
  const enabled = transport === "smtp" || isTruthy(process.env.EMAIL_ENABLED);

  if (!enabled || transport === "disabled" || transport === "none" || transport === "off") {
    return { delivery: "disabled" };
  }

  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const from = process.env.SMTP_FROM;

  if (!host || !portRaw || !from) {
    return { delivery: "disabled" };
  }

  const port = Number(portRaw);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: user ? { user, pass } : undefined
    });

    await transporter.sendMail({ from, to, subject, text });
    return { delivery: "smtp" };
  } catch (e: any) {
    return { delivery: "failed", error: String(e?.message || e) };
  }
}
