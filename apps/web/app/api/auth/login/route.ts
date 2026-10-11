import { forwardHeaders } from "../../../../lib/forward";
import { cookieSecure } from "../../../../lib/cookies";
import { NextResponse } from "next/server";
import { backendFetch } from "../../../lib/backend";

export const dynamic = "force-dynamic";

function redirect303(req: Request, path: string) {
  // Critical for form POSTs: 303 converts the follow-up request to GET.
  // Using 307/308 would re-POST to the next page (e.g. /org/onboarding), causing loops.
  return NextResponse.redirect(new URL(path, req.url), 303);
}

function flashRedirect(req: Request, path: string, errorMessage?: string) {
  const resp = redirect303(req, path);

  if (errorMessage) {
    resp.cookies.set({
      name: "ty_flash_error",
      value: encodeURIComponent(String(errorMessage)),
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      // Short-lived: enough for a single redirect + render.
      maxAge: 15,
    });
  } else {
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
  }

  return resp;
}

export async function POST(req: Request) {
  let email = "";
  let password = "";

  try {
    const form = await req.formData();
    email = String(form.get("email") || "").trim();
    password = String(form.get("password") || "");
    // Optional post-login redirect (must be a relative path)
    const rt = String(form.get("returnTo") || "");
    (req as any).__returnTo = rt;
  } catch {
    return flashRedirect(req, "/login", "Invalid form submission");
  }

  if (!email || !password) {
    return flashRedirect(req, "/login", "Email and password are required");
  }

  // 1) Login against backend
  const res = await backendFetch("/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  // Parse errors consistently (and never leak to query string)
  if (!res.ok) {
    let msg = "Login failed";
    try {
      const data: any = await res.json();
      const err = String(data?.message || data?.error?.message || (typeof data?.error === "string" ? data.error : "") || msg);

      // Provide a clearer message when the backend isn't reachable.
      if (err === "backend_fetch_failed") {
        msg = "The service is temporarily unavailable. Please try again.";
      } else {
        msg = err;
      }
    } catch {
      // ignore
    }
    return flashRedirect(req, "/login", msg);
  }

  const data: any = await res.json().catch(() => ({}));
  const token = String(data?.sessionToken || "");
  if (!token) {
    return flashRedirect(req, "/login", "Missing session token");
  }

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
    const rt = String((req as any).__returnTo || "").trim();
    if (rt && rt.startsWith("/") && !rt.startsWith("//") && !rt.startsWith("/\\") && !/[\r\n]/.test(rt)) {
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