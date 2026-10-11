/** Time-zone helpers (no dependencies): wall-clock ⇄ UTC for a named IANA zone, and display formatting. */

export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Nairobi",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC"
];

/** Offset (minutes) of `tz` at the given instant. */
function offsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-10-20T09:00" in `tz` → ISO UTC string. Empty input → null. */
export function zonedLocalToIso(local: string, tz: string): string | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  // Two passes handle DST boundaries.
  let ts = guess - offsetMinutes(tz, new Date(guess)) * 60000;
  ts = guess - offsetMinutes(tz, new Date(ts)) * 60000;
  return new Date(ts).toISOString();
}

/** ISO → "YYYY-MM-DDTHH:mm" wall-clock in `tz` (for datetime-local inputs). */
export function isoToZonedLocal(iso: string | null | undefined, tz: string, dateOnly = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const shifted = new Date(d.getTime() + offsetMinutes(tz, d) * 60000).toISOString();
  return dateOnly ? shifted.slice(0, 10) : shifted.slice(0, 16);
}

/** "Sat, Oct 24, 9:00 AM EDT" in the given zone. */
export function formatInZone(iso: string | null | undefined, tz: string, opts: { withZone?: boolean; dateOnly?: boolean } = {}): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(opts.dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
    ...(opts.withZone && !opts.dateOnly ? { timeZoneName: "short" } : {})
  }).format(d);
}

const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const DAY_LABELS: Record<(typeof DAYS)[number], string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
export const WEEK_DAYS = DAYS;

export function rruleDays(rule: string | null | undefined): string[] {
  const m = /BYDAY=([A-Z,]+)/.exec(rule || "");
  return m ? m[1].split(",") : [];
}

export function describeRrule(rule: string | null | undefined): string {
  if (!rule) return "";
  const days = rruleDays(rule).map((d) => DAY_LABELS[d as keyof typeof DAY_LABELS] || d);
  if (/FREQ=DAILY/.test(rule)) return "Every day";
  if (/FREQ=MONTHLY/.test(rule)) return "Monthly";
  return days.length ? `Every ${days.join(", ")}` : "Weekly";
}
