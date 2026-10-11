import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)ty_session=([^;]+)/);
  const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";

  if (!token) {
    return NextResponse.json({ unseen_count: 0 }, { status: 401 });
  }

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/notifications/unread-count`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json({ unseen_count: 0, message: body || "Failed" }, { status: res.status });
  }

  const data = (await res.json().catch(() => ({ unread_count: 0 }))) as { unread_count?: number };
  return NextResponse.json({ unseen_count: Number(data.unread_count ?? 0) }, { status: 200 });
}
