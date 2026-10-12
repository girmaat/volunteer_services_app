"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../../lib/backend";

const ok = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn’t work. Try again.";

/** Shares the previewed record (the preview's exact selection, confirmed). */
export async function createRecordAction(fd: FormData) {
  const ids = fd.getAll("ids").map(String).filter(ok);
  const nameMode = fd.get("name") === "legal" ? "legal" : "display";
  const expiresInDays = Number(fd.get("days") || 90);
  const r = await backendFetch("/v1/volunteer/records", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contributionIds: ids, nameMode, expiresInDays, confirmed: fd.get("confirm") === "yes" })
  });
  if (!r.ok) redirect(`/volunteer/records/new?error=${encodeURIComponent(await msg(r))}`);
  const d = (await r.json()) as { id: string };
  redirect(`/volunteer/records?created=${d.id}`);
}

export async function revokeRecordAction(id: string) {
  if (!ok(id)) redirect("/volunteer/records");
  const r = await backendFetch(`/v1/volunteer/records/${id}/revoke`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  redirect(`/volunteer/records?${r.ok ? "flash=revoked" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function reissueRecordAction(id: string) {
  if (!ok(id)) redirect("/volunteer/records");
  const r = await backendFetch(`/v1/volunteer/records/${id}/reissue`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!r.ok) redirect(`/volunteer/records?error=${encodeURIComponent(await msg(r))}`);
  const d = (await r.json()) as { id: string };
  redirect(`/volunteer/records?created=${d.id}`);
}
