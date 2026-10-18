import type { Express } from "express";
import { registerVolunteerProfileRoutes } from "./profile.routes";
import { registerVolunteerOpportunitiesRoutes } from "./opportunities.routes";
import { registerVolunteerApplicationsRoutes } from "./applications.routes";
import { registerVolunteerHistoryRoutes } from "./history.routes";
import { registerVolunteerShareProfileRoutes } from "./share-profile.routes";

/** All /v1 routes for the volunteer area. */
export function registerVolunteerRoutes(app: Express) {
  registerVolunteerProfileRoutes(app);
  registerVolunteerOpportunitiesRoutes(app);
  registerVolunteerApplicationsRoutes(app);
  registerVolunteerHistoryRoutes(app);
  registerVolunteerShareProfileRoutes(app);
}
