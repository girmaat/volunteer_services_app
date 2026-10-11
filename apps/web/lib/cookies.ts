/**
 * Cookie security flags shared by every route that sets a cookie.
 * Secure is on in production (HTTPS) and can be forced either way with COOKIE_SECURE=true|false.
 */
export function cookieSecure(): boolean {
  const v = (process.env.COOKIE_SECURE || "").toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV === "production";
}
