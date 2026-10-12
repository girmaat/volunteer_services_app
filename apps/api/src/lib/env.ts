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
    CORS_ORIGIN: z.string().default("http://localhost:3202"),
    WEB_BASE_URL: HttpUrl.default("http://localhost:3202"),
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
    RATE_LIMIT_DISABLED: bool(false),
    /** Sign-in/sign-up/reset attempts per minute per IP (plan: 5). Raise only for test stacks. */
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(5),
    /** Encrypts two-step sign-in secrets at rest; required in production. */
    MFA_SECRET_KEY: z.string().min(16).optional(),
    /** Platform staff must turn on two-step sign-in before using admin tools. Default: on in production. */
    MFA_REQUIRED_FOR_STAFF: z.string().optional()
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
      if (!env.MFA_SECRET_KEY) ctx.addIssue({ code: "custom", message: "MFA_SECRET_KEY (16+ chars) is required in production" });
      if (env.AUTH_RATE_LIMIT_PER_MINUTE > 10) ctx.addIssue({ code: "custom", message: "AUTH_RATE_LIMIT_PER_MINUTE above 10 is not allowed in production" });
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
/** Two-step sign-in for platform staff: MFA_REQUIRED_FOR_STAFF=true/false, else on only in production. */
export const mfaRequiredForStaff = () => {
  const v = process.env.MFA_REQUIRED_FOR_STAFF ?? env.MFA_REQUIRED_FOR_STAFF;
  return v === undefined || v === "" ? isProduction : ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};
/** Development falls back to a fixed key so local accounts keep working across restarts. */
export const mfaKey = () => env.MFA_SECRET_KEY || "thankyou-dev-only-mfa-key";
