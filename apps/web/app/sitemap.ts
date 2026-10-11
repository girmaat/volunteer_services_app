import type { MetadataRoute } from "next";
import { listPublicOpportunities, listPublicOrganizations } from "../lib/public-api";

export const revalidate = 3600;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";
const STATIC = ["/", "/opportunities", "/organizations", "/how-it-works", "/about", "/impact-stories", "/examples", "/help", "/contact", "/trust-safety", "/code-of-conduct", "/terms", "/privacy", "/signup", "/org/signup"];

/** Public pages plus every open opportunity and organization profile. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: `${SITE}${p}`, changeFrequency: p === "/" || p === "/opportunities" ? "hourly" : "weekly" }));

  let cursor: string | undefined;
  for (let i = 0; i < 40; i++) {
    const page = await listPublicOpportunities({ limit: 50, cursor });
    for (const o of page.items) entries.push({ url: `${SITE}/opportunities/${o.id}`, lastModified: o.updated_at, changeFrequency: "daily" });
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  cursor = undefined;
  for (let i = 0; i < 20; i++) {
    const page = await listPublicOrganizations({ limit: 50, cursor });
    for (const o of page.items) entries.push({ url: `${SITE}/organizations/${o.slug}`, lastModified: o.updated_at, changeFrequency: "weekly" });
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return entries;
}
