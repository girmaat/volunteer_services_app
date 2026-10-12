import type { Express } from "express";
import { registerRequesterDashboardRoutes } from "./dashboard.routes";
import { registerRequesterApplicationsRoutes } from "./applications.routes";
import { registerRequesterProfileRoutes } from "./profile.routes";

/** All /v1 routes for the requester area. */
export function registerRequesterRoutes(app: Express) {
  registerRequesterDashboardRoutes(app);
  registerRequesterApplicationsRoutes(app);
  registerRequesterProfileRoutes(app);
}
