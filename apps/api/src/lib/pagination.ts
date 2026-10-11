/**
 * Opaque offset cursors for list endpoints: ?limit=20&cursor=<opaque>.
 * Responses use { items, nextCursor } (nextCursor null on the last page).
 */
export type PageParams = { limit: number; offset: number };

export function parsePage(query: Record<string, unknown>, defaults = { limit: 20, max: 50 }): PageParams {
  const rawLimit = Number(query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), defaults.max) : defaults.limit;
  let offset = 0;
  if (typeof query.cursor === "string" && query.cursor) {
    try {
      const n = Number(Buffer.from(query.cursor, "base64url").toString("utf8"));
      if (Number.isInteger(n) && n >= 0 && n < 1_000_000) offset = n;
    } catch {
      offset = 0;
    }
  }
  return { limit, offset };
}

/** Pass rows fetched with LIMIT limit+1; returns the page and the next cursor. */
export function toPage<T>(rows: T[], p: PageParams): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > p.limit;
  const items = hasMore ? rows.slice(0, p.limit) : rows;
  const nextCursor = hasMore ? Buffer.from(String(p.offset + p.limit), "utf8").toString("base64url") : null;
  return { items, nextCursor };
}
