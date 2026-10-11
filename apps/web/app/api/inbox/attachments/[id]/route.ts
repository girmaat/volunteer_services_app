import { API_BASE_URL_SERVER } from "@thankyou/config";

export const dynamic = "force-dynamic";

/** Streams a message attachment for a participant (the API checks access). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  if (!m) return new Response("Not authenticated", { status: 401 });
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/inbox/attachments/${id}`, { headers: { authorization: `Bearer ${decodeURIComponent(m[1])}` }, cache: "no-store" });
  if (!r.ok || !r.body) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  for (const h of ["content-type", "content-disposition", "content-length"]) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "private, no-store");
  return new Response(r.body, { headers });
}
