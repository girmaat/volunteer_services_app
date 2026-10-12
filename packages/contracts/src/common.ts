import { z } from "zod";

export const ServiceMode = z.enum(["in-person", "remote", "hybrid"]);
export type ServiceMode = z.infer<typeof ServiceMode>;

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional()
  })
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
export type PageQuery = z.infer<typeof PageQuery>;

export function page<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

/** An absolute http(s) URL. z.string().url() alone also accepts javascript: and data: URLs. */
export const HttpUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "Must be an http(s) URL" });

/** What kind of organization this is. A school can have coordinators (release 2: student service records). */
export const ORG_TYPES = ["nonprofit", "school", "community_group", "faith_based", "government", "other"] as const;
export const OrgType = z.enum(ORG_TYPES);
export type OrgTypeValue = z.infer<typeof OrgType>;
export const ORG_TYPE_LABEL: Record<OrgTypeValue, string> = {
  nonprofit: "Nonprofit",
  school: "School",
  community_group: "Community group",
  faith_based: "Faith-based organization",
  government: "Government agency",
  other: "Other"
};
