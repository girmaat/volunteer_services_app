"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";

const ok = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const BASES = ["/org/hours", "/requester/hours"] as const;
type Base = (typeof BASES)[number];
const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn’t go through. Try again.";
const back = (base: Base, status: string, q: string, anchor = "") => `${base}?status=${encodeURIComponent(status)}&${q}${anchor}`;

/** Approve, adjust, reject or send back one entry. */
export async function decideAction(base: Base, status: string, id: string, fd: FormData) {
  if (!BASES.includes(base) || !ok(id)) redirect("/dashboard");
  const action = String(fd.get("action") || "");
  const hours = String(fd.get("hours") || "").trim();
  const units = String(fd.get("units") || "").trim();
  const reason = String(fd.get("reason") || "").trim();
  const r = await backendFetch(`/v1/contributions/${id}/decide`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...(hours ? { hours: Number(hours) } : {}), ...(units ? { units: Number(units) } : {}), ...(reason ? { reason } : {}) })
  });
  redirect(back(base, status, r.ok ? `flash=${action}` : `error=${encodeURIComponent(await msg(r))}`, `#c-${id}`));
}

/** Approve every selected entry that has nothing to look at. */
export async function bulkApproveAction(base: Base, status: string, fd: FormData) {
  if (!BASES.includes(base)) redirect("/dashboard");
  const ids = fd.getAll("ids").map(String).filter(ok);
  if (!ids.length) redirect(back(base, status, `error=${encodeURIComponent("Tick the hours to approve first.")}`));
  const r = await backendFetch("/v1/contributions/bulk-approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
  if (!r.ok) redirect(back(base, status, `error=${encodeURIComponent(await msg(r))}`));
  const d = (await r.json()) as { approved: string[]; skipped: { id: string; reason: string }[] };
  redirect(back(base, status, `flash=bulk&approved=${d.approved.length}&skipped=${d.skipped.length}`));
}

/** A reviewer says they can't be impartial about this volunteer. */
export async function conflictAction(base: Base, status: string, id: string, fd: FormData) {
  if (!BASES.includes(base) || !ok(id)) redirect("/dashboard");
  const relationship = String(fd.get("relationship") || "").trim();
  const r = await backendFetch(`/v1/contributions/${id}/conflict`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ relationship }) });
  redirect(back(base, status, r.ok ? "flash=conflict" : `error=${encodeURIComponent(await msg(r))}`, `#c-${id}`));
}
