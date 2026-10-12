"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";
import { zonedLocalToIso, zoneOr } from "../../lib/time";
import { ReviewBody } from "@thankyou/contracts";

const ok = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const backOk = (b: string) => /^\/(requester|org)\/requests\/[0-9a-f-]{36}\/applications$|^\/volunteer\/applications\/[0-9a-f-]{36}$/.test(b);
const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn't go through. Try again.";

export async function applicantAction(requestId: string, back: string, appId: string, fd: FormData) {
  if (!ok(requestId) || !ok(appId) || !backOk(back)) redirect("/dashboard");
  const action = String(fd.get("action") || "");
  const tz = zoneOr(fd.get("tz") as string | null);
  const startAt = zonedLocalToIso(String(fd.get("startAt") || ""), tz);
  const amount = String(fd.get("acceptedAmount") || "").trim();
  const r = await backendFetch(`/v1/requests/${requestId}/applicants/${appId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...(startAt ? { startAt } : {}), ...(amount ? { acceptedAmount: Number(amount) } : {}) })
  });
  redirect(`${back}?${r.ok ? `flash=${action}` : `error=${encodeURIComponent(await msg(r))}`}#a-${appId}`);
}

export async function noShowAction(back: string, appId: string) {
  if (!ok(appId) || !backOk(back)) redirect("/dashboard");
  const r = await backendFetch(`/v1/applications/${appId}/no-show`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  redirect(`${back}?${r.ok ? "flash=no_show" : `error=${encodeURIComponent(await msg(r))}`}#a-${appId}`);
}

export async function reviewAction(back: string, appId: string, fd: FormData) {
  if (!ok(appId) || !backOk(back)) redirect("/dashboard");
  const n = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
  const body = ReviewBody.safeParse({
      applicationId: appId,
      overall: n("overall"),
      reliability: n("reliability"),
      communication: n("communication"),
      skill: n("skill"),
      clarity: n("clarity"),
      comment: String(fd.get("comment") || "").trim() || null,
      wouldWorkAgain: fd.get("again") === "yes" ? true : fd.get("again") === "no" ? false : null
  });
  if (!body.success) redirect(`${back}?error=${encodeURIComponent("Pick an overall rating from 1 to 5.")}#review-${appId}`);
  const r = await backendFetch("/v1/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body.data) });
  redirect(`${back}?${r.ok ? "flash=reviewed" : `error=${encodeURIComponent(await msg(r))}`}#review-${appId}`);
}

export async function disputeAction(back: string, appId: string, fd: FormData) {
  if (!ok(appId) || !backOk(back)) redirect("/dashboard");
  const r = await backendFetch("/v1/disputes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId: appId, kind: String(fd.get("kind") || "other"), reason: String(fd.get("reason") || "") })
  });
  redirect(`${back}?${r.ok ? "flash=disputed" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function volunteerCancelAction(appId: string, fd: FormData) {
  if (!ok(appId)) redirect("/volunteer/applications");
  const r = await backendFetch(`/v1/volunteer/applications/${appId}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: String(fd.get("reason") || "").trim() || undefined })
  });
  redirect(`/volunteer/applications/${appId}?${r.ok ? "flash=canceled" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function volunteerWithdrawAction(appId: string) {
  if (!ok(appId)) redirect("/volunteer/applications");
  const r = await backendFetch(`/v1/volunteer/applications/${appId}/withdraw`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  redirect(`/volunteer/applications/${appId}?${r.ok ? "flash=withdrawn" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function confirmAttendanceAction(appId: string) {
  if (!ok(appId)) redirect("/volunteer/applications");
  const r = await backendFetch(`/v1/volunteer/applications/${appId}/confirm-attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  redirect(`/volunteer/applications/${appId}?${r.ok ? "flash=attending" : `error=${encodeURIComponent(await msg(r))}`}`);
}

/** Org attendance: check an accepted volunteer in or out from the applicants list. */
export async function attendanceAction(back: string, appId: string, kind: "check-in" | "check-out") {
  if (!ok(appId) || !backOk(back) || !back.startsWith("/org/") || !["check-in", "check-out"].includes(kind)) redirect("/dashboard");
  const r = await backendFetch(`/v1/org/applications/${appId}/attendance/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  redirect(`${back}?${r.ok ? `flash=${kind === "check-in" ? "checked_in" : "checked_out"}` : `error=${encodeURIComponent(await msg(r))}`}#a-${appId}`);
}
