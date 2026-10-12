"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";

const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn’t save. Try again.";
const ok = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const safePath = (p: string) => (p.startsWith("/volunteer/opportunities/") && !p.includes("//") && !/[\r\n]/.test(p) ? p : "/volunteer/opportunities/recommended");

/** "Save this search" on the opportunity feeds. */
export async function saveSearchAction(fd: FormData) {
  const back = safePath(String(fd.get("back") || ""));
  const query = String(fd.get("query") || "");
  const name = String(fd.get("name") || "").trim() || "My search";
  const r = await backendFetch("/v1/volunteer/saved-searches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, query, alerts: fd.get("alerts") === "on", frequency: "daily" })
  });
  // `back` is the page the volunteer was on, filters included.
  const sep = back.includes("?") ? "&" : "?";
  redirect(r.ok ? `${back}${sep}saved_search=1` : `${back}${sep}saved_search_error=${encodeURIComponent(await msg(r))}`);
}

export async function updateSavedSearchAction(id: string, fd: FormData) {
  if (!ok(id)) redirect("/volunteer/opportunities/saved");
  const r = await backendFetch(`/v1/volunteer/saved-searches/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ alerts: fd.get("alerts") === "on", frequency: fd.get("frequency") === "weekly" ? "weekly" : "daily" })
  });
  redirect(r.ok ? "/volunteer/opportunities/saved?flash=alerts#searches" : `/volunteer/opportunities/saved?error=${encodeURIComponent(await msg(r))}#searches`);
}

export async function deleteSavedSearchAction(id: string) {
  if (!ok(id)) redirect("/volunteer/opportunities/saved");
  const r = await backendFetch(`/v1/volunteer/saved-searches/${id}`, { method: "DELETE" });
  redirect(r.ok ? "/volunteer/opportunities/saved?flash=deleted#searches" : `/volunteer/opportunities/saved?error=${encodeURIComponent(await msg(r))}#searches`);
}
