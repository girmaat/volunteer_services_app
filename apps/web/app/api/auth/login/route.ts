import { forwardHeaders } from "../../../../lib/forward";
import { cookieSecure } from "../../../../lib/cookies";
import { NextResponse } from "next/server";
import { backendFetch } from "../../../lib/backend";
import { finishSignIn } from "../finish";

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

  // Two-step sign-in: hold the short-lived challenge in a cookie and ask for the code.
  if (data?.mfa_required && data?.mfa_token) {
    const resp = redirect303(req, "/login/code");
    resp.cookies.set({
      name: "ty_mfa",
      value: JSON.stringify({ t: String(data.mfa_token), r: String((req as any).__returnTo || "") }),
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: 300
    });
    resp.cookies.set({ name: "ty_flash_error", value: "", httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 0 });
    return resp;
  }

  const token = String(data?.sessionToken || "");
  if (!token) {
    return flashRedirect(req, "/login", "Missing session token");
  }
  return finishSignIn(req, data, token, String((req as any).__returnTo || ""));
}