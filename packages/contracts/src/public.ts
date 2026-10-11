import { z } from "zod";
import { ServiceMode, page } from "./common";

export const PublicOpportunity = z.object({
  id: z.string().uuid(),
  title: z.string(),
  summary: z.string(),
  location: z.string().describe("City-level area, 'Remote', or a placeholder; never an exact address"),
  mode: ServiceMode,
  tags: z.array(z.string()),
  needed_by: z.string().nullable(),
  organization_name: z.string().nullable(),
  organization_slug: z.string().nullable(),
  organization_verified: z.boolean(),
  updated_at: z.string()
});
export type PublicOpportunity = z.infer<typeof PublicOpportunity>;
export const PublicOpportunityPage = page(PublicOpportunity);

export const PublicOpportunityQuery = z.object({
  q: z.string().max(100).optional(),
  mode: ServiceMode.optional(),
  org: z.string().max(120).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
});

export const PublicOrganization = z.object({
  slug: z.string(),
  name: z.string(),
  summary: z.string(),
  location: z.string().nullable(),
  verified: z.boolean(),
  updated_at: z.string()
});
export type PublicOrganization = z.infer<typeof PublicOrganization>;
export const PublicOrganizationPage = page(PublicOrganization);

export const PublicOrganizationDetail = PublicOrganization.extend({
  mission: z.string().nullable(),
  website_url: z.string().url().nullable(),
  logo_url: z.string().nullable(),
  verification_status: z.string(),
  verified_at: z.string().nullable(),
  open_requests: z.number().int()
});
export type PublicOrganizationDetail = z.infer<typeof PublicOrganizationDetail>;

export const PublicPageContent = z.object({ slug: z.string(), title: z.string(), body: z.string(), updated_at: z.string() });

export const ContactRequest = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(5000)
});
export type ContactRequest = z.infer<typeof ContactRequest>;
