import { NextResponse } from "next/server";
import { cookieSecure } from "../../../lib/cookies";
import { backendFetch } from "../../lib/backend";
import { safeLocalPath } from "../../../lib/safePath";

/**
 * After a successful sign-in (password, or password + code): pick where to go, store the session
 * cookie and clear any flash error.
 */
export async function finishSignIn(req: Request, data: any, token: string, returnTo: string) {

  // 2) Decide where to go (org vs non-org)
  let location = "/dashboard";
  const role = String(data?.user?.role || "");
  const accountType = String(data?.user?.account_type || "");
  const requesterMode = String(data?.user?.requester_mode || "");

  const looksLikeOrgUser = role === "org_admin" || accountType === "org_team_member";
  const looksLikeOrgRequester =
    role === "requester" && (requesterMode === "organization" || accountType === "requester_org");

  if (looksLikeOrgUser) {
    try {
      const orgRes = await backendFetch("/v1/org/me", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (orgRes.ok) {
        const ctx: any = await orgRes.json().catch(() => null);
        const done = Boolean(ctx?.org?.onboarding_completed);
        location = done ? "/org/dashboard" : "/org/onboarding";
      } else if (orgRes.status === 403 || orgRes.status === 404) {
        // Org user without org context should be able to reach /org/signup.
        location = "/org/signup";
      } else {
        location = "/org/signup";
      }
    } catch {
      location = "/org/signup";
    }
  } else if (looksLikeOrgRequester) {
    // Org requester must create/join an org (and will be guided if profile not complete).
    location = "/org/signup";
  } else {
    const onboardingDone = Boolean(data?.user?.onboarding_completed);
    location = onboardingDone ? "/dashboard" : "/onboarding";
  }


  // Optional post-login redirect (from form hidden field)
  try {
    const rt = String(returnTo || "").trim();
    if (rt && safeLocalPath(rt, "") === rt) {
      location = rt;
    }
  } catch {
    // ignore
  }

  // 3) Redirect with Set-Cookie so the browser stores it
  const resp = NextResponse.redirect(new URL(location, req.url), 303);
  resp.cookies.set({
    name: "ty_session",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
  });

  // Clear any prior error
  resp.cookies.set({
    name: "ty_flash_error",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
  });

  return resp;
}
