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
