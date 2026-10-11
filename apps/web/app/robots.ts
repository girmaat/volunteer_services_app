import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002";

export default function robots(): MetadataRoute.Robots {
  // Staging and previews must never be indexed.
  if (process.env.NEXT_PUBLIC_ALLOW_INDEXING !== "true") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/volunteer/", "/requester/", "/org/", "/admin/", "/settings/", "/api/", "/dashboard", "/onboarding", "/s/", "/share/"]
      }
    ],
    sitemap: `${SITE}/sitemap.xml`
  };
}
