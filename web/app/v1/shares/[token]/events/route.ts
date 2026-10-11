import { NextResponse } from "next/server";
import { backendFetch } from "../../../../lib/backend";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const token = String(params.token || "");
  const body = await req.json().catch(() => ({} as any));
  const eventType = String(body?.event_type || body?.eventType || "");

  const res = await backendFetch(`/v1/shares/${encodeURIComponent(token)}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event_type: eventType }),
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
    },
  });
}
