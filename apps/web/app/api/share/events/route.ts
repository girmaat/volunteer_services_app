import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";

function getTokenFromCookie(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)ty_session=([^;]+)/);
  return tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";
}

function authHeaders(req: Request) {
  const token = getTokenFromCookie(req);
  if (!token) return null;
  return { authorization: `Bearer ${token}` };
}

export async function POST(req: Request) {
  const headers = authHeaders(req);
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/shares/${encodeURIComponent(token)}/events`, {
    method: "POST",
    headers: { ...(headers || {}), "content-type": "application/json" },
    body: JSON.stringify({ event_type: body.event_type }),
    cache: "no-store"
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json" } });
}
