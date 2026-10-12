"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../../lib/backend";
import { zonedLocalToIso } from "../../../lib/time";

const ok = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const TZ = "America/New_York";
const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn’t save. Try again.";
const go = (q: string, anchor: string) => redirect(`/volunteer/history?${q}${anchor}`);

/** Times (date + start/end) or just hours, plus what happened. */
function timeFields(fd: FormData) {
  const date = String(fd.get("date") || "").trim();
  const start = String(fd.get("start") || "").trim();
  const end = String(fd.get("end") || "").trim();
  const hours = String(fd.get("hours") || "").trim();
  const out: Record<string, unknown> = {};
  if (date && start && end) {
    out.startedAt = zonedLocalToIso(`${date}T${start}`, TZ);
    out.endedAt = zonedLocalToIso(`${date}T${end}`, TZ);
  } else if (hours) out.hours = Number(hours);
  return out;
}

/** Report time for an engagement; it goes to the reviewer as waiting for approval. */
export async function reportAction(applicationId: string, fd: FormData) {
  if (!ok(applicationId)) redirect("/volunteer/history");
  const description = String(fd.get("description") || "").trim();
  const r = await backendFetch("/v1/volunteer/contributions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ applicationId, description, ...timeFields(fd) })
  });
  go(r.ok ? "flash=reported" : `error=${encodeURIComponent(await msg(r))}`, `#w-${applicationId}`);
}

/** Service that happened outside ThankYou: kept, but always marked self-reported. */
export async function outsideAction(fd: FormData) {
  const description = String(fd.get("description") || "").trim();
  const r = await backendFetch("/v1/volunteer/contributions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description, ...timeFields(fd) }) });
  go(r.ok ? "flash=outside" : `error=${encodeURIComponent(await msg(r))}`, "#outside");
}

export async function resubmitAction(id: string, anchor: string, fd: FormData) {
  if (!ok(id)) redirect("/volunteer/history");
  const description = String(fd.get("description") || "").trim();
  const r = await backendFetch(`/v1/volunteer/contributions/${id}/resubmit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(description ? { description } : {}), ...timeFields(fd) })
  });
  go(r.ok ? "flash=resubmitted" : `error=${encodeURIComponent(await msg(r))}`, anchor);
}

export async function disputeAction(id: string, anchor: string, fd: FormData) {
  if (!ok(id)) redirect("/volunteer/history");
  const r = await backendFetch(`/v1/volunteer/contributions/${id}/dispute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: String(fd.get("reason") || "").trim() })
  });
  go(r.ok ? "flash=disputed" : `error=${encodeURIComponent(await msg(r))}`, anchor);
}
