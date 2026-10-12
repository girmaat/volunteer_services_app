/**
 * Calendar changes (CAL-02): when a shift moves or is canceled, the commitment's SEQUENCE goes up
 * and the volunteer gets an email carrying an updated invite (same UID) or a cancellation, sent
 * only if they keep calendar emails on.
 */
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { icsEvent } from "../../lib/ics";
import { formatShort } from "./format";
import { notify } from "../notifications/service";

export async function commitmentIcs(commitmentId: string) {
  const r = await pool.query(
    `SELECT c.id, c.start_at, c.end_at, c.status, c.ics_sequence, r.title, r.mode, r.public_area, r.exact_address, r.duration_minutes, r.timezone,
            c.volunteer_user_id, a.id AS application_id
       FROM request_commitments c
       JOIN service_requests r ON r.id = c.request_id
       LEFT JOIN request_applications a ON a.request_id = c.request_id AND a.volunteer_user_id = c.volunteer_user_id
      WHERE c.id = $1 AND c.start_at IS NOT NULL`,
    [commitmentId]
  );
  const c = r.rows[0];
  if (!c) return null;
  const start = new Date(c.start_at);
  const end = c.end_at ? new Date(c.end_at) : new Date(start.getTime() + (Number(c.duration_minutes) || 60) * 60_000);
  const link = `${env.WEB_BASE_URL}/volunteer/applications/${c.application_id ?? ""}`;
  const canceled = c.status === "canceled";
  return {
    row: c,
    start,
    body: icsEvent({
      uid: `commitment-${c.id}@thankyou`,
      start,
      end,
      title: `Volunteering: ${c.title}`,
      location: c.mode === "remote" ? "Remote" : c.exact_address || c.public_area || undefined,
      description: `Details and messages: ${link}`,
      url: link,
      sequence: Number(c.ics_sequence) || 0,
      canceled,
      method: canceled ? "CANCEL" : "REQUEST"
    })
  };
}

export async function calendarChanged(commitmentIds: string[], kind: "update" | "cancel") {
  for (const id of commitmentIds) {
    await pool.query("UPDATE request_commitments SET ics_sequence = ics_sequence + 1, canceled_at = CASE WHEN $2 THEN COALESCE(canceled_at, NOW()) ELSE canceled_at END WHERE id = $1", [id, kind === "cancel"]);
    const ics = await commitmentIcs(id);
    if (!ics) continue;
    const title = kind === "cancel" ? `Canceled: “${ics.row.title}”` : `New time for “${ics.row.title}”`;
    const when = formatShort(ics.start, ics.row.timezone);
    await notify(String(ics.row.volunteer_user_id), "calendar", {
      title,
      body: kind === "cancel" ? "Your calendar invite was canceled." : `Now ${when}.`,
      href: ics.row.application_id ? `/volunteer/applications/${ics.row.application_id}` : "/volunteer/schedule",
      email: {
        subject: title,
        heading: title,
        lines: [kind === "cancel" ? "This shift is off, and the attached update removes it from your calendar." : `It's now ${when}. The attached invite updates your calendar.`],
        cta: { label: "Open your application", url: ics.row.application_id ? `/volunteer/applications/${ics.row.application_id}` : "/volunteer/schedule" },
        icalEvent: { method: kind === "cancel" ? "CANCEL" : "REQUEST", content: ics.body, filename: "thankyou-shift.ics" },
        dedupeKey: `calendar:${id}:${kind}:${Date.now()}`
      }
    });
  }
}
