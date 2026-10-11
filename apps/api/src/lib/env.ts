import { HttpUrl } from "@thankyou/contracts";
import "dotenv/config";
import { z } from "zod";

/**
 * Validated runtime configuration. Importing this module loads .env (outside production)
 * and fails fast with a readable message when required settings are missing or malformed.
 */
const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_URL_MIGRATIONS: z.string().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    CORS_ORIGIN: z.string().default("http://localhost:3002"),
    WEB_BASE_URL: HttpUrl.default("http://localhost:3002"),
    /** Public URL of this API (used in List-Unsubscribe one-click links). */
    API_PUBLIC_URL: HttpUrl.default("http://localhost:4000"),
    /** HMAC secret for unsubscribe links; required in production. */
    NOTIFICATION_SECRET: z.string().min(16).optional(),
    TRUST_PROXY: z.string().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    LOG_REQUESTS: bool(false),
    EMAIL_TRANSPORT: z.enum(["log", "smtp", "disabled"]).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    GEOCODING_DISABLED: bool(false),
    JOBS_DISABLED: bool(false),
    RATE_LIMIT_DISABLED: bool(false)
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if ((env.EMAIL_TRANSPORT ?? "smtp") === "smtp" && (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM)) {
        ctx.addIssue({ code: "custom", message: "SMTP_HOST, SMTP_PORT and SMTP_FROM are required in production" });
      }
      if (!env.WEB_BASE_URL.startsWith("https://")) {
        ctx.addIssue({ code: "custom", message: "WEB_BASE_URL must be https:// in production" });
      }
      if (!env.NOTIFICATION_SECRET) ctx.addIssue({ code: "custom", message: "NOTIFICATION_SECRET (16+ chars) is required in production" });
      if (env.RATE_LIMIT_DISABLED) ctx.addIssue({ code: "custom", message: "RATE_LIMIT_DISABLED is not allowed in production" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    // eslint-disable-next-line no-console
    console.error(`[ThankYou API] Invalid configuration:\n${msg}`);
    throw new Error("Invalid configuration");
  }
  return parsed.data;
}

export const env = load();
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
