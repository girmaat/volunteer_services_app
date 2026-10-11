import "server-only";
import { headers } from "next/headers";

/**
 * Headers that let the API rate-limit and audit by the real visitor IP when the call is made by
 * this Next.js server on the visitor's behalf. The API trusts x-client-ip only when x-internal-key
 * matches its INTERNAL_API_KEY, so browsers can't spoof it.
 */
export async function forwardHeaders(): Promise<Record<string, string>> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return {};
  let ip = "";
  try {
    const h = await headers();
    ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "";
  } catch {
    // Outside a request (build / ISR): nothing to forward.
    return {};
  }
  return ip ? { "x-internal-key": key, "x-client-ip": ip.slice(0, 64) } : {};
}
