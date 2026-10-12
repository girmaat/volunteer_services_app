export const API_BASE_URL_PUBLIC =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4202";

/**
 * Server-only override.
 *
 * Use API_BASE_URL when the Next.js server (or server actions/route handlers) cannot reach the backend
 * via the public URL (e.g. Docker, different network namespace, etc).
 */
export const API_BASE_URL_SERVER = process.env.API_BASE_URL || API_BASE_URL_PUBLIC;

// Backward-compatible alias (kept for any client-side usage).
export const API_BASE_URL = API_BASE_URL_PUBLIC;
