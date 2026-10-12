/**
 * A same-site path for redirects and links built from user input (returnTo, notification links).
 * Rejects anything a browser could read as another site: "//host", backslashes, and control
 * characters such as tab or newline (browsers drop them, so "/<TAB>/evil.com" becomes "//evil.com").
 */
export function safeLocalPath(input: unknown, fallback: string): string {
  const s = String(input ?? "");
  if (!s.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(s)) return fallback;
  try {
    const base = "http://same-site.invalid";
    const u = new URL(s, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
