/**
 * Server start-up. Pages that know a time zone (the request's, or the viewer's) pass it explicitly;
 * anything formatted without one uses the pilot's zone rather than the server's UTC clock.
 * Override with APP_TIMEZONE.
 */
export function register() {
  if (typeof process !== "undefined" && process.env) process.env.TZ = process.env.APP_TIMEZONE || "America/New_York";
}
