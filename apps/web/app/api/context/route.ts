import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import { homeForContext } from "../../../lib/access";

function token(req: Request) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)ty_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/** Switches the active context (volunteer · requester · org · admin) and goes to its home. */
export async function POST(req: Request) {
  const t = token(req);
  if (!t) return NextResponse.redirect(new URL("/login", req.url), 303);
  const form = await req.formData().catch(() => null);
  const context = String(form?.get("context") || "");
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/me/context`, {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ context }),
    cache: "no-store"
  }).catch(() => null);
  const ok = Boolean(r && r.ok);
  return NextResponse.redirect(new URL(ok ? homeForContext(context) : "/dashboard", req.url), 303);
}
