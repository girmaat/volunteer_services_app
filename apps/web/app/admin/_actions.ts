"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";

const ok = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn't go through.";
const post = (path: string, body: unknown) => backendFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function reviewRequest(id: string, fd: FormData) {
  if (!ok(id)) redirect("/admin/moderation");
  const r = await post(`/v1/admin/requests/${id}/review`, { decision: String(fd.get("decision")), notes: String(fd.get("notes") || "") || undefined });
  redirect(`/admin/moderation?tab=review&${r.ok ? "flash=done" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function decideMessage(id: string, fd: FormData) {
  if (!ok(id)) redirect("/admin/moderation?tab=messages");
  const r = await post(`/v1/admin/messages/${id}/decide`, { decision: String(fd.get("decision")) });
  redirect(`/admin/moderation?tab=messages&${r.ok ? "flash=done" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function decideDispute(id: string, fd: FormData) {
  if (!ok(id)) redirect("/admin/moderation?tab=disputes");
  const r = await post(`/v1/admin/disputes/${id}/decide`, { status: String(fd.get("status")), notes: String(fd.get("notes") || "") });
  redirect(`/admin/moderation?tab=disputes&${r.ok ? "flash=done" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function takeDown(id: string, back: string, fd: FormData) {
  if (!ok(id) || !back.startsWith("/admin")) redirect("/admin");
  const r = await post(`/v1/admin/requests/${id}/take-down`, { reason: String(fd.get("reason") || "") });
  redirect(`${back}${back.includes("?") ? "&" : "?"}${r.ok ? "flash=removed" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function restoreRequest(id: string, back: string) {
  if (!ok(id) || !back.startsWith("/admin")) redirect("/admin");
  const r = await post(`/v1/admin/requests/${id}/restore`, {});
  redirect(`${back}${back.includes("?") ? "&" : "?"}${r.ok ? "flash=restored" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function shadowBan(id: string, on: boolean, back: string) {
  if (!ok(id) || !back.startsWith("/admin")) redirect("/admin");
  const r = await post(`/v1/admin/users/${id}/shadow-ban`, { on });
  redirect(`${back}${back.includes("?") ? "&" : "?"}${r.ok ? "flash=saved" : `error=${encodeURIComponent(await msg(r))}`}`);
}

export async function setBackgroundCheck(id: string, back: string, fd: FormData) {
  if (!ok(id) || !back.startsWith("/admin")) redirect("/admin");
  const r = await post(`/v1/admin/users/${id}/background-check`, { status: String(fd.get("status")) });
  redirect(`${back}${back.includes("?") ? "&" : "?"}${r.ok ? "flash=saved" : `error=${encodeURIComponent(await msg(r))}`}`);
}
