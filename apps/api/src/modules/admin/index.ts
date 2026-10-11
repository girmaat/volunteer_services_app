import type { Express } from "express";
import { registerAdminOrgVerificationRoutes } from "./orgVerification.routes";
import { registerAdminDashboardRoutes } from "./dashboard.routes";
import { registerAdminPlatformRoutes } from "./platform.routes";
import { registerAdminUsersRoutes } from "./users.routes";
import { registerAdminModerationRoutes } from "./moderation.routes";
import { registerAdminContentRoutes } from "./content.routes";
import { registerAdminVerificationRoutes } from "./verification.routes";
import { registerAdminQueueRoutes } from "./queues.routes";

/** All /v1 routes for the admin area. */
export function registerAdminRoutes(app: Express) {
  registerAdminOrgVerificationRoutes(app);
  registerAdminDashboardRoutes(app);
  registerAdminPlatformRoutes(app);
  registerAdminUsersRoutes(app);
  registerAdminModerationRoutes(app);
  registerAdminContentRoutes(app);
  registerAdminVerificationRoutes(app);
  registerAdminQueueRoutes(app);
}
