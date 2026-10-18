/**
 * Email templates: every message has an HTML part and a plain-text part, one brand layout,
 * a single call to action, and (for non-transactional mail) an unsubscribe link in the footer.
 */
export type EmailContent = {
  subject: string;
  heading: string;
  lines: string[];
  cta?: { label: string; url: string };
  /** Small print under the CTA (e.g. safety reminder). */
  note?: string;
  /** Attached calendar invite or cancellation. */
  icalEvent?: { method: "REQUEST" | "CANCEL" | "PUBLISH"; content: string; filename?: string };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderEmail(c: EmailContent, opts: { unsubscribeUrl?: string; preferencesUrl: string }) {
  const text = [
    c.heading,
    "",
    ...c.lines,
    ...(c.cta ? ["", `${c.cta.label}: ${c.cta.url}`] : []),
    ...(c.note ? ["", c.note] : []),
    "",
    "—",
    "Volunteer Services · neighbors and nonprofits helping each other",
    `Notification settings: ${opts.preferencesUrl}`,
    ...(opts.unsubscribeUrl ? [`Unsubscribe from these emails: ${opts.unsubscribeUrl}`] : [])
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#fafaf8;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#17242f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e1dc;border-radius:12px;">
        <tr><td style="padding:24px 28px 0 28px;font-weight:700;font-size:18px;color:#0f6e66;">Volunteer Services</td></tr>
        <tr><td style="padding:16px 28px 0 28px;">
          <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#17242f;">${esc(c.heading)}</h1>
          ${c.lines.map((l) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.55;">${esc(l)}</p>`).join("\n          ")}
        </td></tr>
        ${
          c.cta
            ? `<tr><td style="padding:8px 28px 8px 28px;"><a href="${esc(c.cta.url)}" style="display:inline-block;background:#0f6e66;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:8px;">${esc(c.cta.label)}</a></td></tr>`
            : ""
        }
        ${c.note ? `<tr><td style="padding:8px 28px 0 28px;font-size:13px;line-height:1.5;color:#5a6772;">${esc(c.note)}</td></tr>` : ""}
        <tr><td style="padding:24px 28px 24px 28px;font-size:12px;line-height:1.5;color:#5a6772;border-top:1px solid #e3e1dc;">
          Volunteer Services · neighbors and nonprofits helping each other. Not for emergencies.<br>
          <a href="${esc(opts.preferencesUrl)}" style="color:#5a6772;">Notification settings</a>${
            opts.unsubscribeUrl ? ` · <a href="${esc(opts.unsubscribeUrl)}" style="color:#5a6772;">Unsubscribe from these emails</a>` : ""
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: c.subject, text, html };
}
