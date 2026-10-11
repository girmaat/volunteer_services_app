import { API_BASE_URL_SERVER } from "@thankyou/config";
import { safeHref } from "../../../../lib/notifications";

export const dynamic = "force-dynamic";

/** Opening a notification marks it read, then goes to the thing it's about. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  if (!m) return new Response(null, { status: 303, headers: { Location: "/login?returnTo=/notifications" } });
  const auth = { authorization: `Bearer ${decodeURIComponent(m[1])}` };
  let href = "/notifications";
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const list = await fetch(`${API_BASE_URL_SERVER}/v1/notifications/${id}`, { headers: auth, cache: "no-store" }).catch(() => null);
    if (list?.ok) href = safeHref(((await list.json()) as { href?: string | null }).href);
    await fetch(`${API_BASE_URL_SERVER}/v1/notifications/read`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
      cache: "no-store"
    }).catch(() => null);
  }
  return new Response(null, { status: 303, headers: { Location: href, "Cache-Control": "no-store" } });
}
