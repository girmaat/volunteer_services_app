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

export async function GET(req: Request, { params }: { params: { orgId: string } }) {
  const headers = authHeaders(req);
  if (!headers) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/orgs/${encodeURIComponent(params.orgId)}`, { method: "GET", headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: Request, { params }: { params: { orgId: string } }) {
  const headers = authHeaders(req);
  if (!headers) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/orgs/${encodeURIComponent(params.orgId)}`, {
    method: "PATCH",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
