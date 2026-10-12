import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { forwardHeaders } from "../../../../lib/forward";
import { cookieSecure } from "../../../../lib/cookies";
import { backendFetch } from "../../../lib/backend";
import { finishSignIn } from "../finish";

export const dynamic = "force-dynamic";

function back(req: Request, path: string, error: string, clearChallenge = false) {
  const resp = NextResponse.redirect(new URL(path, req.url), 303);
  resp.cookies.set({ name: "ty_flash_error", value: encodeURIComponent(error), httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 15 });
  if (clearChallenge) resp.cookies.set({ name: "ty_mfa", value: "", httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 0 });
  return resp;
}

/** Second sign-in step: the 6-digit code (or a recovery code) for the challenge held in ty_mfa. */
export async function POST(req: Request) {
  let challenge: { t?: string; r?: string } = {};
  try {
    challenge = JSON.parse((await cookies()).get("ty_mfa")?.value || "{}");
  } catch {
    challenge = {};
  }
  if (!challenge.t) return back(req, "/login", "That sign-in expired. Enter your password again.", true);
  const form = await req.formData().catch(() => null);
  const code = String(form?.get("code") || "").trim();
  if (!code) return back(req, "/login/code", "Enter the code from your authenticator app.");

  const res = await backendFetch("/v1/auth/mfa", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await forwardHeaders()) },
    body: JSON.stringify({ mfaToken: challenge.t, code }),
    cache: "no-store"
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data?.message || "That code didn’t work.");
    return data?.error?.code === "mfa_expired" ? back(req, "/login", msg, true) : back(req, "/login/code", msg);
  }
  const resp = await finishSignIn(req, data, String(data.sessionToken), String(challenge.r || ""));
  resp.cookies.set({ name: "ty_mfa", value: "", httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 0 });
  if (data?.used_recovery_code) {
    resp.cookies.set({
      name: "ty_flash_error",
      value: encodeURIComponent(`You used a recovery code; ${data.recovery_codes_left ?? 0} left. Set up two-step sign-in again in Settings → Account if you lost your phone.`),
      httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 15
    });
  }
  return resp;
}
