"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";
import { zonedLocalToIso } from "../../lib/time";
import { RequestFields } from "@thankyou/contracts";

const LABELS: Record<string, string> = {
  title: "Title", description: "Description", category: "Category", volunteersNeeded: "Volunteers needed", startsAt: "Start", endsAt: "End",
  durationMinutes: "Duration", applyBy: "Apply by", publicArea: "Area", exactAddress: "Address", minAge: "Minimum age", timezone: "Time zone", recurrenceRule: "Repeat days"
};

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optStr = (fd: FormData, k: string) => (str(fd, k) ? str(fd, k) : null);
const num = (fd: FormData, k: string) => (str(fd, k) ? Number(str(fd, k)) : null);

function errorText(body: unknown): string {
  const b = body as { message?: string; error?: { message?: string }; errors?: { fieldErrors?: Record<string, string[]> } } | null;
  const fe = b?.errors?.fieldErrors;
  if (fe && Object.keys(fe).length) {
    return Object.entries(fe)
      .map(([k, v]) => `${k}: ${v.join(", ")}`)
      .join("; ");
  }
  return b?.message || b?.error?.message || "Something went wrong. Try again.";
}

/** Reads one wizard step from the form into API fields. */
function fieldsForStep(step: number, fd: FormData): Record<string, unknown> {
  const tz = str(fd, "timezone") || "America/New_York";
  switch (step) {
    case 1:
      return {
        title: str(fd, "title"),
        category: str(fd, "category"),
        description: str(fd, "description"),
        requiredSkills: str(fd, "requiredSkills"),
        niceToHaveSkills: str(fd, "niceToHaveSkills"),
        volunteersNeeded: num(fd, "volunteersNeeded") ?? 1,
        urgency: str(fd, "urgency") || "normal"
      };
    case 2: {
      const scheduleType = str(fd, "scheduleType") || "flexible_window";
      const days = fd.getAll("days").map(String).filter(Boolean);
      return {
        scheduleType,
        timezone: tz,
        startsAt: zonedLocalToIso(str(fd, "startsAt"), tz),
        endsAt: zonedLocalToIso(str(fd, "endsAt"), tz),
        recurrenceRule: scheduleType === "recurring" && days.length ? `FREQ=WEEKLY;BYDAY=${days.join(",")}` : null,
        durationMinutes: num(fd, "durationMinutes"),
        applyBy: zonedLocalToIso(str(fd, "applyBy") ? `${str(fd, "applyBy")}T23:59` : "", tz)
      };
    }
    case 3:
      return {
        mode: str(fd, "mode") || "remote",
        publicArea: optStr(fd, "publicArea"),
        exactAddress: optStr(fd, "exactAddress"),
        accessibilityNotes: optStr(fd, "accessibilityNotes")
      };
    case 4:
      return {
        minAge: num(fd, "minAge"),
        requiresBackgroundCheck: fd.get("requiresBackgroundCheck") === "on",
        requiresTraining: fd.get("requiresTraining") === "on",
        requiresWaiver: fd.get("requiresWaiver") === "on",
        requiresCar: fd.get("requiresCar") === "on",
        equipmentNotes: optStr(fd, "equipmentNotes")
      };
    default:
      return {};
  }
}

/** Saves the current step (creating the draft on step 1) and moves to the next one. */
export async function saveWizardStep(fd: FormData) {
  const base = str(fd, "base");
  const owner = str(fd, "owner") === "org" ? "org" : "requester";
  const step = Number(str(fd, "step")) || 1;
  const nav = str(fd, "nav"); // "next" | "back" | "save"
  let id = str(fd, "id");
  if (!/^\/(requester|org)\/requests\/new$/.test(base)) redirect("/dashboard");

  const fields = fieldsForStep(step, fd);
  // Same schema the API uses (packages/contracts), so errors show before a round-trip.
  const check = RequestFields.safeParse(fields);
  if (!check.success) {
    const msg = Object.entries(check.error.flatten().fieldErrors)
      .map(([k, v]) => `${LABELS[k] ?? k}: ${(v ?? []).join(", ")}`)
      .join("; ");
    redirect(`${base}?${new URLSearchParams({ ...(id ? { id } : {}), step: String(step), error: msg })}`);
  }
  let res: Response;
  if (!id) {
    res = await backendFetch("/v1/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ as: owner, ...fields }) });
    if (res.ok) id = String(((await res.json()) as { id: string }).id);
  } else {
    res = await backendFetch(`/v1/requests/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
  }
  if (!res.ok) {
    const msg = errorText(await res.json().catch(() => null));
    redirect(`${base}?${new URLSearchParams({ ...(id ? { id } : {}), step: String(step), error: msg })}`);
  }
  const next = nav === "back" ? Math.max(1, step - 1) : nav === "save" ? step : Math.min(5, step + 1);
  redirect(`${base}?${new URLSearchParams({ id, step: String(next), ...(nav === "save" ? { saved: "1" } : {}) })}`);
}

/** Publishes (or submits for review) from the last step. */
export async function publishDraft(fd: FormData) {
  const base = str(fd, "base");
  const id = str(fd, "id");
  const detail = str(fd, "detail");
  if (!/^\/(requester|org)\/requests\/new$/.test(base) || !/^\/(requester|org)\/requests\/[0-9a-f-]{36}$/.test(detail)) redirect("/dashboard");
  const res = await backendFetch(`/v1/requests/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "publish" })
  });
  if (!res.ok) {
    const msg = errorText(await res.json().catch(() => null));
    redirect(`${base}?${new URLSearchParams({ id, step: "5", error: msg })}`);
  }
  const out = (await res.json()) as { review_status: string };
  redirect(`${detail}?${new URLSearchParams({ flash: out.review_status === "pending_review" ? "submitted" : "published" })}`);
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
