import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@helpers/shared-config";

function getToken(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)ty_session=([^;]+)/);
  return tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";
}

async function proxy(req: Request, method: "POST" | "DELETE", id: string) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/volunteer/opportunities/${id}/save`, {
    method,
    headers: {
      authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  const bodyText = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    return NextResponse.json({ message: json?.message || bodyText || "Failed" }, { status: res.status });
  }

  return NextResponse.json(json ?? { ok: true }, { status: 200 });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const id = String(ctx.params.id || "");
  return proxy(req, "POST", id);
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const id = String(ctx.params.id || "");
  return proxy(req, "DELETE", id);
}
