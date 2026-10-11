import crypto from "crypto";
import type { Request } from "express";

/**
 * The visitor's IP. When the request comes from our own web server (x-internal-key matches
 * INTERNAL_API_KEY) we use the IP it forwards; otherwise Express's req.ip (which honours
 * TRUST_PROXY). Never trusts a forwarded IP from an unauthenticated caller.
 */
export function clientIp(req: Request): string {
  const key = process.env.INTERNAL_API_KEY;
  const sent = req.header("x-internal-key");
  const forwarded = req.header("x-client-ip");
  if (key && sent && forwarded && sent.length === key.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(key))) {
    return forwarded.slice(0, 64);
  }
  return req.ip || "unknown";
}
