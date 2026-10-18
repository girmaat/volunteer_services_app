import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";

export const dynamic = "force-dynamic";

// Only these API downloads can be proxied.
const ALLOWED: Record<string, string> = {
  "my-data": "/v1/me/export",
  "impact-csv": "/v1/volunteer/history/export.csv"
};

/** Streams a personal download (data export, impact CSV) with the session token from the cookie. */
export async function GET(req: Request) {
  const what = new URL(req.url).searchParams.get("what") || "";
  const path = ALLOWED[what];
  if (!path) return new Response("Not found", { status: 404 });
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  if (!m) return new Response("Not authenticated", { status: 401 });
  const r = await fetch(`${API_BASE_URL_SERVER}${path}`, { headers: { authorization: `Bearer ${decodeURIComponent(m[1])}` }, cache: "no-store" });
  if (!r.ok || !r.body) return new Response("Download unavailable", { status: r.status || 502 });
  const headers = new Headers({ "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
  for (const h of ["content-type", "content-disposition"]) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(r.body, { headers });
}
