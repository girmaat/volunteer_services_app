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
  if (!headers) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Invalid payload" }, { status: 400 });

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/shares`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json" } });
}
