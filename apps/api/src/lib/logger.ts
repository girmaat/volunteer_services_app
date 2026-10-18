import pino from "pino";
import { env, isProduction, isTest } from "./env";

/**
 * Structured JSON logs in production (shipped by the host), pretty logs locally.
 * Secrets and session tokens are redacted.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? (isTest ? "silent" : isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "*.password",
      "*.passwordHash",
      "*.password_hash",
      "*.token",
      "*.sessionToken"
    ],
    censor: "[redacted]"
  },
  base: { service: "volunteer-services-app-api" },
  transport: !isProduction && !isTest ? { target: "pino-pretty", options: { singleLine: true, ignore: "pid,hostname,service" } } : undefined
});
