/** The discovery query string, shared by the listing endpoint and saved searches. */
import { z } from "zod";
import type { DiscoveryFilters } from "./query";

const csv = z
  .string()
  .max(500)
  .transform((s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 20));

export const DiscoveryQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: csv.optional(),
  skills: csv.optional(),
  mode: z.enum(["in-person", "remote", "hybrid"]).optional(),
  radius: z.coerce.number().min(1).max(200).optional(),
  starts_after: z.string().datetime({ offset: true }).optional(),
  starts_before: z.string().datetime({ offset: true }).optional(),
  verified_org: z.enum(["true", "false"]).optional(),
  urgency: z.enum(["low", "normal", "high"]).optional(),
  tab: z.enum(["recommended", "nearby", "remote", "all"]).optional(),
  org: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(40).optional()
});

export type DiscoveryQueryInput = z.infer<typeof DiscoveryQuery>;

export function filtersFrom(qy: DiscoveryQueryInput, offset = 0): DiscoveryFilters {
  return {
    q: qy.q || undefined,
    categories: qy.category,
    skills: qy.skills,
    mode: qy.mode,
    radius: qy.radius,
    startsAfter: qy.starts_after,
    startsBefore: qy.starts_before,
    verifiedOrg: qy.verified_org === "true",
    urgency: qy.urgency,
    tab: qy.tab,
    orgSlug: qy.org,
    limit: qy.limit,
    offset
  };
}
