import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@helpers/shared-config";

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

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/share/events`, {
    method: "POST",
    headers: { ...(headers || {}), "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json" } });
}
