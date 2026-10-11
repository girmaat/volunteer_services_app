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

/** Plan: 5 attempts a minute per IP and per email on login, signup and password reset (the IP limit is AUTH_RATE_LIMIT_PER_MINUTE). */
export const authIpLimiter = rateLimit({ ...base, windowMs: 60_000, limit: env.AUTH_RATE_LIMIT_PER_MINUTE });
export const authEmailLimiter = rateLimit({ ...base, windowMs: 60_000, limit: Math.min(env.AUTH_RATE_LIMIT_PER_MINUTE, 5), keyGenerator: emailKey });

/** General write limit: 60/min per signed-in user (session token), else per IP. */
export const writeLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 60,
  skip: (req) => env.RATE_LIMIT_DISABLED || ["GET", "HEAD", "OPTIONS"].includes(req.method),
  keyGenerator: (req) => {
    const auth = req.header("authorization") || "";
    return auth.startsWith("Bearer ") ? `tok:${auth.slice(7, 47)}` : `ip:${clientIp(req)}`;
  }
});

/** Public, unauthenticated form endpoints (contact, share reports). */
export const publicFormLimiter = rateLimit({ ...base, windowMs: 10 * 60_000, limit: 10 });
