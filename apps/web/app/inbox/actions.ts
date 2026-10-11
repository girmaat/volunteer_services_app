"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";

const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn't go through. Try again.";

export async function sendMessageAction(id: string, fd: FormData) {
  if (!idOk(id)) redirect("/inbox");
  const body = String(fd.get("body") || "").trim();
  const file = fd.get("file");
  let res: Response;
  if (file instanceof File && file.size > 0) {
    const out = new FormData();
    out.set("file", file, file.name);
    if (body) out.set("body", body);
    res = await backendFetch(`/v1/inbox/conversations/${id}/attachments`, { method: "POST", body: out });
  } else {
    if (!body) redirect(`/inbox/${id}`);
    res = await backendFetch(`/v1/inbox/conversations/${id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
  }
  if (!res.ok) redirect(`/inbox/${id}?error=${encodeURIComponent(await msg(res))}`);
  redirect(`/inbox/${id}`);
}

export async function threadAction(id: string, fd: FormData) {
  if (!idOk(id)) redirect("/inbox");
  const kind = String(fd.get("kind") || "");
  if (kind === "report") {
    const r = await backendFetch(`/v1/inbox/conversations/${id}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: String(fd.get("category") || "other"), details: String(fd.get("details") || "") })
    });
    redirect(`/inbox/${id}?${r.ok ? "flash=reported" : `error=${encodeURIComponent(await msg(r))}`}`);
  }
  if (kind === "block" || kind === "end") {
    const r = await backendFetch(`/v1/inbox/conversations/${id}/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    redirect(`/inbox/${id}?${r.ok ? `flash=${kind}` : `error=${encodeURIComponent(await msg(r))}`}`);
  }
  redirect(`/inbox/${id}`);
}
