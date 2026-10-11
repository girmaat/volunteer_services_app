import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@helpers/shared-config";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") || "";

  if (!token) {
    return NextResponse.redirect(new URL(`/verify-email?error=${encodeURIComponent("Missing token")}`, req.url));
  }

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/auth/verify-email?token=${encodeURIComponent(token)}`, {
    method: "GET",
    cache: "no-store"
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err?.message || "Verification failed";
    return NextResponse.redirect(new URL(`/verify-email?error=${encodeURIComponent(message)}`, req.url));
  }

  const data = await res.json().catch(() => ({}));
  const sessionToken = String(data.sessionToken || "");

  if (!sessionToken) {
    return NextResponse.redirect(new URL(`/verify-email?error=${encodeURIComponent("Missing session token")}`, req.url));
  }

  // Decide where to send the user after email verification.
  // - Org team members => org area
  // - Org requesters (requester_mode=organization) => org signup
  // - Others => standard onboarding
  let location = "/onboarding";

  try {
    const meRes = await fetch(`${API_BASE_URL_SERVER}/v1/me`, {
      method: "GET",
      headers: { authorization: `Bearer ${sessionToken}` },
      cache: "no-store"
    });

    if (meRes.ok) {
      const me: any = await meRes.json().catch(() => null);
      const role = String(me?.role || "");
      const accountType = String(me?.account_type || "");
      const requesterMode = String(me?.requester_mode || "");

      const looksLikeOrgUser = role === "org_admin" || accountType === "org_team_member";
      const looksLikeOrgRequester = role === "requester" && (requesterMode === "organization" || accountType === "requester_org");

      if (looksLikeOrgUser) {
        const orgRes = await fetch(`${API_BASE_URL_SERVER}/v1/org/me`, {
          method: "GET",
          headers: { authorization: `Bearer ${sessionToken}` },
          cache: "no-store"
        });

        if (orgRes.ok) {
          const ctx: any = await orgRes.json().catch(() => null);
          const done = Boolean(ctx?.org?.onboarding_completed);
          location = done ? "/org/dashboard" : "/org/onboarding";
        } else if (orgRes.status === 403 || orgRes.status === 404) {
          location = "/org/signup";
        } else {
          location = "/org/signup";
        }
      } else if (looksLikeOrgRequester) {
        location = "/org/signup";
      } else {
        location = "/onboarding";
      }
    }
  } catch {
    // Fall back to default
  }

  const next = NextResponse.redirect(new URL(location, req.url));
  next.cookies.set("ty_session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/"
  });
  return next;
}
