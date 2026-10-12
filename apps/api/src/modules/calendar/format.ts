/** "Sat, Oct 17, 9:00 AM EDT" in the request's time zone. */
export function formatShort(d: Date, tz: string | null | undefined) {
  try {
    return d.toLocaleString("en-US", { timeZone: tz || "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  } catch {
    return d.toISOString();
  }
}
