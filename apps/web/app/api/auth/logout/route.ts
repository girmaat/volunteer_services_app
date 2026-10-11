import { cookieSecure } from "../../../../lib/cookies";
import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@thankyou/config";

// POST only: a GET logout can be triggered by any <img> on another site.
export async function POST(req: Request) {
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

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set("ty_session", "", { httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 0 });
  return res;
}
