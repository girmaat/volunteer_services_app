"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";
import { errorText, optStr, publishTarget, str, wizardStepTarget } from "./wizard";

/** Saves the current step (creating the draft on step 1) and moves to the next one. */
export async function saveWizardStep(fd: FormData) {
  redirect(await wizardStepTarget(fd));
}

/** Publishes (or submits for review) from the last step. */
export async function publishDraft(fd: FormData) {
  redirect(await publishTarget(fd));
}

/** Owner actions on a live request: pause, resume, complete, cancel (with reason). */
export async function requestAction(fd: FormData) {
  const id = str(fd, "id");
  const event = str(fd, "event");
  const back = str(fd, "back");
  if (!/^\/(requester|org)\/requests\/[0-9a-f-]{36}$/.test(back)) redirect("/dashboard");
  const res = await backendFetch(`/v1/requests/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, reason: optStr(fd, "reason") ?? undefined })
  });
  if (!res.ok) redirect(`${back}?${new URLSearchParams({ error: errorText(await res.json().catch(() => null)) })}`);
  redirect(`${back}?${new URLSearchParams({ flash: event })}`);
}

export async function deleteDraft(fd: FormData) {
  const id = str(fd, "id");
  const list = str(fd, "list");
  if (!/^\/(requester|org)\/requests$/.test(list)) redirect("/dashboard");
  await backendFetch(`/v1/requests/${encodeURIComponent(id)}`, { method: "DELETE" });
  redirect(list);
}

/** An organization owner approves a coordinator's request (it publishes) or sends it back with a note. */
export async function ownerApprovalAction(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/org/requests");
  const decision = fd.get("decision") === "reject" ? "reject" : "approve";
  const notes = String(fd.get("notes") || "").trim();
  const res = await backendFetch(`/v1/requests/${id}/owner-approval`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, ...(notes ? { notes } : {}) })
  });
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  redirect(`/org/requests/${id}?${res.ok ? `flash=${decision === "approve" ? "owner_approved" : "owner_rejected"}` : `error=${encodeURIComponent(body?.message || "That didn’t go through.")}`}`);
}

/** Shows (or rotates) the request's on-site check-in code. */
export async function checkinCodeAction(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/org/requests");
  const res = await backendFetch(`/v1/requests/${id}/checkin-code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rotate: fd.get("rotate") === "1" }) });
  redirect(`/org/requests/${id}?${res.ok ? (fd.get("rotate") === "1" ? "flash=code_rotated" : "") : "error=" + encodeURIComponent("The check-in code couldn’t be made.")}#checkin`);
}
