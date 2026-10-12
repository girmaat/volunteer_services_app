import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { errorShape } from "./middleware/errorShape";
import crypto from "crypto";
import pinoHttp from "pino-http";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./lib/errors";
import { authEmailLimiter, authIpLimiter, publicFormLimiter, writeLimiter } from "./middleware/rateLimit";
import { registerPlatformRoutes } from "./modules/platform/routes";
import { registerPublicRoutes } from "./modules/public/routes";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerShareRoutes } from "./modules/share/routes";
import { registerVolunteerRoutes } from "./modules/volunteer";
import { registerRequesterRoutes } from "./modules/requester";
import { registerSettingsRoutes } from "./modules/settings/routes";
import { registerOrgRoutes } from "./modules/org";
import { registerAdminRoutes } from "./modules/admin";
import { adminAudit } from "./middleware/adminAudit";
import { registerRequestRoutes } from "./modules/requests/routes";
import { registerNotificationRoutes } from "./modules/notifications/routes";
import { registerDiscoveryRoutes } from "./modules/discovery/routes";
import { registerMessagingRoutes } from "./modules/messaging/routes";
import { onMessageReceived } from "./modules/messaging/jobs";
import { registerJobHandler } from "./jobs/queue";
import { runHourly, onHourly } from "./jobs/maintenance";
import { awardBadges } from "./modules/volunteer/badges";
import { registerReviewRoutes } from "./modules/reviews/routes";
import { registerApplicantRoutes } from "./modules/requests/applicants";
import { registerAccountRoutes } from "./modules/account/routes";
import { revealDueReviews } from "./modules/reviews/service";
import { registerDocsRoutes } from "./openapi/docs";
import { registerContributionRoutes } from "./modules/contributions/routes";
import { registerRecordRoutes } from "./modules/records/routes";
import { registerPrerequisiteRoutes } from "./modules/prerequisites/routes";
import { registerOfferRoutes } from "./modules/requests/offers";
import { registerCheckinRoutes } from "./modules/requests/checkin";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);

  // Request id (propagated from a proxy's x-request-id when present) + structured access log.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: env.LOG_REQUESTS ? true : { ignore: (req) => req.url === "/v1/health" },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode })
      }
    })
  );

  app.use(
    helmet({
      // JSON API: no HTML except /v1/docs, which loads the Redoc bundle from jsDelivr.
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'none'"],
          "script-src": ["'self'", "https://cdn.jsdelivr.net"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:", "https://cdn.redoc.ly"],
          "connect-src": ["'self'"],
          "worker-src": ["blob:"],
          "frame-ancestors": ["'none'"]
        }
      },
      crossOriginResourcePolicy: { policy: "same-site" }
    })
  );
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()), credentials: false, maxAge: 600 }));
  // gzip JSON responses; never the live inbox stream (it must flush each event).
  app.use(compression({ filter: (req, res) => !req.path.endsWith("/inbox/stream") && compression.filter(req, res) }));
  app.use(errorShape);
  app.use(express.json({ limit: "1mb" }));

  // Rate limits
  app.use(["/v1/auth/login", "/v1/auth/signup", "/v1/auth/forgot-password", "/v1/auth/resend-verification", "/v1/auth/reset-password", "/v1/auth/change-password"], authIpLimiter, authEmailLimiter);
  app.use(["/v1/public/contact", "/v1/shares/:token/report", "/v1/orgs/enroll"], publicFormLimiter);
  app.use("/v1", writeLimiter);

  registerPlatformRoutes(app);
  registerDocsRoutes(app);
  registerPublicRoutes(app);
  registerAuthRoutes(app);
  registerShareRoutes(app);
  registerVolunteerRoutes(app);
  registerRequesterRoutes(app);
  registerSettingsRoutes(app);
  registerOrgRoutes(app);
  registerRequestRoutes(app);
  registerNotificationRoutes(app);
  registerDiscoveryRoutes(app);
  registerMessagingRoutes(app);
  registerJobHandler("notify.message_received", onMessageReceived);
  registerJobHandler("maintenance.hourly", runHourly);
  registerJobHandler("badges.award", awardBadges);
  registerReviewRoutes(app);
  registerApplicantRoutes(app);
  registerAccountRoutes(app);
  registerContributionRoutes(app);
  registerRecordRoutes(app);
  registerPrerequisiteRoutes(app);
  registerOfferRoutes(app);
  registerCheckinRoutes(app);
  onHourly(revealDueReviews);
  app.use("/v1/admin", adminAudit);
  registerAdminRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
