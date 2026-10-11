import { API_BASE_URL_SERVER } from "@thankyou/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Proxies the API's Server-Sent Events stream, adding the session token from the cookie. */
export async function GET(req: Request) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  if (!m) return new Response("Not authenticated", { status: 401 });
  const upstream = await fetch(`${API_BASE_URL_SERVER}/v1/inbox/stream`, {
    headers: { authorization: `Bearer ${decodeURIComponent(m[1])}`, accept: "text/event-stream" },
    cache: "no-store",
    signal: req.signal
  }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) return new Response("Stream unavailable", { status: 503 });
  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" }
  });
}
