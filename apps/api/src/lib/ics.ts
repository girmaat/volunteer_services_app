/** Minimal RFC 5545 calendar file for a single event. */

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Folds content lines at 75 octets (continuation lines start with a space). */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > 75) {
      out.push(cur);
      cur = " " + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

/**
 * One event. The UID is stable per commitment; SEQUENCE goes up on every change so calendars
 * replace the old event, and a cancellation uses METHOD:CANCEL with STATUS:CANCELLED (CAL-01/02).
 * Titles never carry minors' contact details, waiver contents or beneficiary information (CAL-03).
 */
export function icsEvent(e: {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  sequence?: number;
  method?: "PUBLISH" | "REQUEST" | "CANCEL";
  canceled?: boolean;
  /** A repeating shift: RRULE (e.g. FREQ=WEEKLY;BYDAY=SA,SU) with local times in `timezone`. */
  rrule?: string | null;
  timezone?: string | null;
}) {
  const rrule = e.rrule && /^[A-Z0-9=;,:+-]+$/.test(e.rrule) ? e.rrule : null;
  // Repeating events keep their wall-clock time across daylight saving changes, so they use TZID.
  const tz = rrule && e.timezone && validZone(e.timezone) ? e.timezone : null;
  const when = (k: "DTSTART" | "DTEND", d: Date) => (tz ? `${k};TZID=${tz}:${localStamp(d, tz)}` : `${k}:${stamp(d)}`);
  const method = e.method ?? (e.canceled ? "CANCEL" : "PUBLISH");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ThankYou//Volunteer commitments//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    `STATUS:${e.canceled ? "CANCELLED" : "CONFIRMED"}`,
    `DTSTAMP:${stamp(new Date())}`,
    when("DTSTART", e.start),
    when("DTEND", e.end),
    ...(rrule ? [`RRULE:${rrule}`] : []),
    `SUMMARY:${esc(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    ...(e.canceled ? [] : ["BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYYMMDDTHHMMSS in the given time zone (no Z). */
function localStamp(d: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}
