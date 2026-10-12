/** True while a ban is in force. An open-ended ban is stored as "infinity" (pg returns Infinity). */
export function isBanned(user: unknown): boolean {
  const until = (user as { banned_until?: unknown } | null)?.banned_until;
  if (until === null || until === undefined || until === "") return false;
  if (until === Infinity || String(until) === "infinity" || String(until) === "Infinity") return true;
  const t = new Date(until as string).getTime();
  return Number.isNaN(t) ? true : t > Date.now();
}
