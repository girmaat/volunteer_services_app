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
