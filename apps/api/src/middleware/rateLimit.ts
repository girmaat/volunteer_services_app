import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../lib/env";
import { clientIp } from "../lib/clientIp";

/**
 * Rate limits (per process; behind several instances, move the store to Postgres/Redis).
 * Auth endpoints are limited per IP AND per submitted email to slow credential stuffing.
 */
const base: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => env.RATE_LIMIT_DISABLED,
  keyGenerator: (req) => `ip:${clientIp(req)}`,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: { code: "rate_limited", message: "Too many requests. Please wait a moment and try again." },
      message: "Too many requests. Please wait a moment and try again."
    });
  }
};

const emailKey = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `email:${email || clientIp(req)}`;
};

export const authIpLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 10 });
export const authEmailLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 10, keyGenerator: emailKey });

/** General write limit per caller (bearer token if present, else IP). */
export const writeLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 120,
  skip: (req) => env.RATE_LIMIT_DISABLED || ["GET", "HEAD", "OPTIONS"].includes(req.method),
  keyGenerator: (req) => {
    const auth = req.header("authorization") || "";
    return auth.startsWith("Bearer ") ? `tok:${auth.slice(7, 47)}` : `ip:${clientIp(req)}`;
  }
});

/** Public, unauthenticated form endpoints (contact, share reports). */
export const publicFormLimiter = rateLimit({ ...base, windowMs: 10 * 60_000, limit: 10 });
