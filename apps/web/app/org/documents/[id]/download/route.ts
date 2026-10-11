import { inOrg } from "../../../../../lib/access";
import { backendFetch, getCurrentUser } from "../../../../lib/backend";
import { getOrgContext } from "../../../../lib/org";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!inOrg(user)) return new Response("Forbidden", { status: 403 });
  const ctx = await getOrgContext();
  if (!ctx) return new Response("Organization context required", { status: 403 });
  if (!ctx.org.onboarding_completed) return new Response("Onboarding required", { status: 403 });

  const res = await backendFetch(`/v1/org/documents/${params.id}/download`, { method: "GET" });
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
