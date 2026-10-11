import { API_BASE_URL_SERVER } from "@helpers/shared-config";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const cookieHeader = req.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)ty_session=([^;]+)/);
  const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";

  if (!token) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  const upstream = await fetch(`${API_BASE_URL_SERVER}/v1/volunteer/calendar/commitments/${params.id}/ics`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return new Response(text || JSON.stringify({ message: "Failed to download ICS" }), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json" }
    });
  }

  const buf = await upstream.arrayBuffer();

  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "text/calendar; charset=utf-8");
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);

  return new Response(buf, { status: 200, headers });
}
