import type { Express } from "express";
import { registerOrgDashboardRoutes } from "./dashboard.routes";
import { registerOrgEnrollmentRoutes } from "./enrollment.routes";
import { registerOrgTeamRoutes } from "./team.routes";
import { registerOrgRequestsRoutes } from "./requests.routes";
import { registerOrgApplicationsRoutes } from "./applications.routes";
import { registerOrgComplianceRoutes } from "./compliance.routes";
import { registerOrgDocumentsRoutes } from "./documents.routes";
import { registerOrgReportsRoutes } from "./reports.routes";

/** All /v1 routes for the org area. */
export function registerOrgRoutes(app: Express) {
  registerOrgDashboardRoutes(app);
  registerOrgEnrollmentRoutes(app);
  registerOrgTeamRoutes(app);
  registerOrgRequestsRoutes(app);
  registerOrgApplicationsRoutes(app);
  registerOrgComplianceRoutes(app);
  registerOrgDocumentsRoutes(app);
  registerOrgReportsRoutes(app);
}
