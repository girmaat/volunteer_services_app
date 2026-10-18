/** "0.4 mi" → "under a mile"; otherwise one decimal below 10 miles, whole miles above. */
export function miles(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n < 1) return "under a mile";
  return `${n < 10 ? Math.round(n * 10) / 10 : Math.round(n)} mi`;
}

/** ID verification status in plain words (never the raw code). */
export function idCheckLabel(status: string | null | undefined) {
  const s = String(status || "");
  if (s === "approved") return "ID verified";
  if (s === "submitted") return "ID check waiting";
  if (s === "rejected") return "ID check declined";
  return "ID not checked";
}

/** Typical reply time in plain words. */
export function replyTimeLabel(seconds: number | null | undefined) {
  if (seconds == null || !isFinite(seconds) || seconds <= 0) return "Not enough messages yet";
  if (seconds < 60) return "Under a minute";
  if (seconds < 3600) return `About ${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `About ${Math.round(seconds / 3600)} h`;
  return `About ${Math.round(seconds / 86400)} days`;
}
