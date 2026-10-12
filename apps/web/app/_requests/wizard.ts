import "server-only";

import { backendFetch } from "../lib/backend";
import { zonedLocalToIso } from "../../lib/time";
import { RequestFields } from "@thankyou/contracts";

const LABELS: Record<string, string> = {
  title: "Title", description: "Description", category: "Category", volunteersNeeded: "Volunteers needed", startsAt: "Start", endsAt: "End",
  durationMinutes: "Duration", applyBy: "Apply by", publicArea: "Area", exactAddress: "Address", minAge: "Minimum age", timezone: "Time zone", recurrenceRule: "Repeat days",
  targetValue: "Goal", targetUnit: "Goal unit", minContribution: "Smallest useful offer"
};

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => (str(fd, k) ? str(fd, k) : null);
const num = (fd: FormData, k: string) => (str(fd, k) ? Number(str(fd, k)) : null);

export function errorText(body: unknown): string {
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
        urgency: str(fd, "urgency") || "normal",
        // Optional goal: an amount in a unit (40 hours, 200 meals). Hours by default.
        targetValue: num(fd, "targetValue"),
        targetUnit: num(fd, "targetValue") != null ? (optStr(fd, "targetUnit") || "hours").toLowerCase() : null,
        minContribution: num(fd, "targetValue") != null ? num(fd, "minContribution") : null,
        allowOverfill: fd.get("allowOverfill") === "on"
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
        requiresGuardianConsent: fd.get("requiresGuardianConsent") === "on",
        equipmentNotes: optStr(fd, "equipmentNotes")
      };
    default:
      return {};
  }
}

/**
 * Saves one wizard step and returns where to go next. Shared by the server action and the
 * plain-POST route (app/api/requests/wizard), which the wizard uses so every step is a full,
 * deterministic page load.
 */
export async function wizardStepTarget(fd: FormData): Promise<string> {
  const base = str(fd, "base");
  const owner = str(fd, "owner") === "org" ? "org" : "requester";
  const step = Number(str(fd, "step")) || 1;
  const nav = str(fd, "nav"); // "next" | "back" | "save"
  let id = str(fd, "id");
  if (!/^\/(requester|org)\/requests\/new$/.test(base)) return "/dashboard";

  const fields = fieldsForStep(step, fd);
  // Same schema the API uses (packages/contracts), so errors show before a round-trip.
  const check = RequestFields.safeParse(fields);
  if (!check.success) {
    const msg = Object.entries(check.error.flatten().fieldErrors)
      .map(([k, v]) => `${LABELS[k] ?? k}: ${(v ?? []).join(", ")}`)
      .join("; ");
    return `${base}?${new URLSearchParams({ ...(id ? { id } : {}), step: String(step), error: msg })}`;
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
    return `${base}?${new URLSearchParams({ ...(id ? { id } : {}), step: String(step), error: msg })}`;
  }
  const next = nav === "back" ? Math.max(1, step - 1) : nav === "save" ? step : Math.min(5, step + 1);
  return `${base}?${new URLSearchParams({ id, step: String(next), ...(nav === "save" ? { saved: "1" } : {}) })}`;
}

export async function publishTarget(fd: FormData): Promise<string> {
  const base = str(fd, "base");
  const id = str(fd, "id");
  const detail = str(fd, "detail");
  if (!/^\/(requester|org)\/requests\/new$/.test(base) || !/^\/(requester|org)\/requests\/[0-9a-f-]{36}$/.test(detail)) return "/dashboard";
  const res = await backendFetch(`/v1/requests/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "publish" })
  });
  if (!res.ok) {
    const msg = errorText(await res.json().catch(() => null));
    return `${base}?${new URLSearchParams({ id, step: "5", error: msg })}`;
  }
  const out = (await res.json()) as { review_status: string; owner_approval?: string };
  const flash = out.owner_approval === "pending" ? "awaiting_owner" : out.review_status === "pending_review" ? "submitted" : "published";
  return `${detail}?${new URLSearchParams({ flash })}`;
}

