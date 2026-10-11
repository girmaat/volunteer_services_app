import type { Express } from "express";
import { registerVolunteerProfileRoutes } from "./profile.routes";
import { registerVolunteerOpportunitiesRoutes } from "./opportunities.routes";
import { registerVolunteerApplicationsRoutes } from "./applications.routes";
import { registerVolunteerMessagesRoutes } from "./messages.routes";
import { registerVolunteerHistoryRoutes } from "./history.routes";

/** All /v1 routes for the volunteer area. */
export function registerVolunteerRoutes(app: Express) {
  registerVolunteerProfileRoutes(app);
  registerVolunteerOpportunitiesRoutes(app);
  registerVolunteerApplicationsRoutes(app);
  registerVolunteerMessagesRoutes(app);
  registerVolunteerHistoryRoutes(app);
}
