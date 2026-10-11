import { NextResponse } from "next/server";
import { backendFetch } from "../../../lib/backend";

export const dynamic = "force-dynamic";

export async function GET(_: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const token = String(params.token || "");
  const res = await backendFetch(`/v1/shares/${encodeURIComponent(token)}`, { method: "GET", cache: "no-store" });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
    },
  });
}
