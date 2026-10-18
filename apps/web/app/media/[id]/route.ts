import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";

export const dynamic = "force-dynamic";

/** Hosted images (logos, profile photos), served from this site so pages load no third-party images. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/public/media/${id}`, { next: { revalidate: 3600 } }).catch(() => null);
  if (!r || !r.ok || !r.body) return new Response("Not found", { status: 404 });
  const type = r.headers.get("content-type") || "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(type)) return new Response("Not found", { status: 404 });
  return new Response(r.body, {
    headers: { "content-type": type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" }
  });
}
