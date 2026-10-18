import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";

function token(req: Request) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/** Adds the volunteer or requester role to the signed-in account, then opens that role's profile setup. */
export async function POST(req: Request) {
  const t = token(req);
  if (!t) return NextResponse.redirect(new URL("/login", req.url), 303);
  const form = await req.formData().catch(() => null);
  const role = String(form?.get("role") || "");
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/me/roles`, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ role }),
    cache: "no-store"
  }).catch(() => null);
  if (!r || !r.ok) return NextResponse.redirect(new URL("/settings/roles?error=1", req.url), 303);
  const data = (await r.json()) as { next?: string };
  return NextResponse.redirect(new URL(data.next || "/dashboard", req.url), 303);
}
