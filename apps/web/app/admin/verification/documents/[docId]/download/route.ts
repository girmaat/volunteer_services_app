import { backendFetch, getCurrentUser } from "../../../../../lib/backend";

export const dynamic = "force-dynamic";

export async function GET(_: Request, props: { params: Promise<{ docId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!user.is_platform_admin) return new Response("Forbidden", { status: 403 });

  const docId = decodeURIComponent(params.docId);
  const res = await backendFetch(`/v1/admin/user-verification/documents/${encodeURIComponent(docId)}/download`, { method: "GET" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "Failed");
    return new Response(msg || "Failed", { status: res.status || 500 });
  }

  const buf = await res.arrayBuffer();
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  const cd = res.headers.get("content-disposition");
  if (ct) headers.set("content-type", ct);
  if (cd) headers.set("content-disposition", cd);
  return new Response(buf, { status: 200, headers });
}
