import { backendFetch, getCurrentUser } from "../../../../lib/backend";

export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "volunteer") return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const requestId = url.searchParams.get("requestId");
  if (!requestId) return new Response("requestId is required", { status: 400 });

  const res = await backendFetch(`/v1/volunteer/documents/${params.id}/download?requestId=${encodeURIComponent(requestId)}`, { method: "GET" });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const disp = res.headers.get("content-disposition") || `attachment; filename="document"`;

  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": disp
    }
  });
}
