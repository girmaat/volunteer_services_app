/** "0.4 mi" → "under a mile"; otherwise one decimal below 10 miles, whole miles above. */
export function miles(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n < 1) return "under a mile";
  return `${n < 10 ? Math.round(n * 10) / 10 : Math.round(n)} mi`;
}
