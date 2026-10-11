import type { Express } from "express";
import { registerRequesterDashboardRoutes } from "./dashboard.routes";
import { registerRequesterApplicationsRoutes } from "./applications.routes";
import { registerRequesterMessagesRoutes } from "./messages.routes";
import { registerRequesterProfileRoutes } from "./profile.routes";
import { registerRequesterRequestsRoutes } from "./requests.routes";

/** All /v1 routes for the requester area. */
export function registerRequesterRoutes(app: Express) {
  registerRequesterDashboardRoutes(app);
  registerRequesterApplicationsRoutes(app);
  registerRequesterMessagesRoutes(app);
  registerRequesterProfileRoutes(app);
  registerRequesterRequestsRoutes(app);
}
