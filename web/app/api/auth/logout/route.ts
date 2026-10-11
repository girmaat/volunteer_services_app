import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@helpers/shared-config";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)ty_session=([^;]+)/);
  const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "";

  if (token) {
    await fetch(`${API_BASE_URL_SERVER}/v1/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store"
    }).catch(() => {});
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set("ty_session", "", { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 0 });
  return res;
}
