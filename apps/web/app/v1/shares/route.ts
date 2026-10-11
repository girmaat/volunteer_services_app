import { NextResponse } from "next/server";
import { backendFetch } from "../../lib/backend";

export const runtime = "nodejs";

function mapTargetType(targetType: string) {
  switch (targetType) {
    case "request":
      return "SERVICE_REQUEST";
    case "opportunity":
      return "OPPORTUNITY";
    case "org":
      return "ORGANIZATION";
    case "impact":
      return "IMPACT_STORY";
    case "page":
      return "PUBLIC_PAGE";
    case "volunteer":
      return "VOLUNTEER_PROFILE";
    case "invite":
      return "INVITE";
    default:
      return null;
  }
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const shareType = mapTargetType(String(body?.target_type || ""));
  if (!shareType) return NextResponse.json({ message: "Unknown target_type" }, { status: 400 });

  const targetRef = String(body?.target_ref || "").trim();
  if (!targetRef) return NextResponse.json({ message: "Missing target_ref" }, { status: 400 });

  const visibility = body?.visibility ? String(body.visibility) : undefined;

  const expiresInDays = Number(body?.expires_in_days ?? NaN);

  const payload: any = {
    share_type: shareType,
    target_ref: targetRef,
    ...(visibility ? { visibility } : {}),
    ...(Number.isFinite(expiresInDays) && expiresInDays > 0 ? { expires_in_days: expiresInDays } : {})
  };

  const upstream = await backendFetch("/v1/shares", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const raw = await upstream.text();

  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    // Leave json null
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { message: json?.message ? String(json.message) : `Share link failed (HTTP ${upstream.status})` },
      { status: upstream.status }
    );
  }

  if (!json || typeof json !== "object") {
    return NextResponse.json(
      { message: "Unexpected backend response while creating share link." },
      { status: 502 }
    );
  }

  // Ensure the expected fields exist for the client share UI.
  const token = String(json.token || "");
  const share_path =
    String(json.share_path || json.sharePath || "") ||
    (token ? `/s/${token}` : "");

  return NextResponse.json(
    { ...json, token, share_path },
    { status: upstream.status }
  );
}

