import { backendFetch, getCurrentUser } from "../../../../lib/backend";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** Downloads a contribution's evidence file. The API decides who may see it (the volunteer and their reviewers). */
export async function GET(_req: Request, props: { params: Promise<{ id: string; evidenceId: string }> }) {
  const { id, evidenceId } = await props.params;
  if (!UUID.test(id) || !UUID.test(evidenceId)) return new Response("Not found", { status: 404 });
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const res = await backendFetch(`/v1/contributions/${id}/evidence/${evidenceId}/file`, { method: "GET" });
  if (!res.ok) return new Response("Not found", { status: 404 });
  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") || "application/octet-stream",
      "content-disposition": res.headers.get("content-disposition") || `attachment; filename="evidence"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store"
    }
  });
}
