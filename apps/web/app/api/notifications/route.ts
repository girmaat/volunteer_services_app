import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";

export const dynamic = "force-dynamic";

/** Latest notifications for the bell menu (the session cookie becomes the bearer token). */
export async function GET(req: Request) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  if (!m) return Response.json({ notifications: [], unread_count: 0 }, { status: 401 });
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/notifications?limit=8`, { headers: { authorization: `Bearer ${decodeURIComponent(m[1])}` }, cache: "no-store" }).catch(() => null);
  if (!r?.ok) return Response.json({ notifications: [], unread_count: 0 }, { status: r?.status || 502 });
  return new Response(await r.text(), { headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
}
