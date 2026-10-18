import { cookieSecure } from "../../../../lib/cookies";
import { NextResponse } from "next/server";
import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";

/** Old links pointed here directly; they now open the page with the "Verify my email" button. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  return NextResponse.redirect(new URL(`/verify-email${token ? `?token=${encodeURIComponent(token)}` : ""}`, req.url), 303);
}

/** The button on /verify-email: verifies (single use) and signs in. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") || "");

  if (!token) {
    return NextResponse.redirect(new URL(`/verify-email?error=${encodeURIComponent("Missing token")}`, req.url), 303);
  }

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store"
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err?.message || "Verification failed";
    return NextResponse.redirect(new URL(`/verify-email?error=${encodeURIComponent(message)}`, req.url), 303);
  }

  const data = await res.json().catch(() => ({}));
  const sessionToken = String(data.sessionToken || "");

  if (!sessionToken) {
    return NextResponse.redirect(new URL(`/verify-email?error=${encodeURIComponent("Missing session token")}`, req.url), 303);
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
      const body: any = await meRes.json().catch(() => null);
      const me = body?.user ?? body; // /v1/me returns { user }
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

  const next = NextResponse.redirect(new URL(location, req.url), 303);
  next.cookies.set("ty_session", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/"
  });
  return next;
}
