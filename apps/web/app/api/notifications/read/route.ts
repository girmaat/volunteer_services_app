import { API_BASE_URL_SERVER } from "@thankyou/config";

export const dynamic = "force-dynamic";

/** Mark all notifications read (bell menu). */
export async function POST(req: Request) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  if (!m) return Response.json({ ok: false }, { status: 401 });
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/notifications/read`, {
    method: "POST",
    headers: { authorization: `Bearer ${decodeURIComponent(m[1])}`, "content-type": "application/json" },
    body: JSON.stringify({ all: true }),
    cache: "no-store"
  }).catch(() => null);
  return Response.json({ ok: Boolean(r?.ok) }, { status: r?.ok ? 200 : 502 });
}
