"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backendFetch } from "../app/lib/backend";

const back = (base: string, id: string) => (base === "/volunteer/opportunities" ? `/volunteer/opportunities/${id}` : `/opportunities/${id}`);

export async function applyToOpportunity(base: string, id: string, fd: FormData) {
  const message = String(fd.get("message") || "").trim();
  const amount = String(fd.get("offeredAmount") || "").trim();
  const res = await backendFetch(`/v1/volunteer/opportunities/${encodeURIComponent(id)}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, ...(amount ? { offeredAmount: Number(amount) } : {}) })
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    redirect(`${back(base, id)}?error=${encodeURIComponent(body?.message || "Your application didn't go through. Try again.")}#apply`);
  }
  revalidatePath(back(base, id));
  redirect(`${back(base, id)}?flash=applied`);
}

export async function toggleSave(base: string, id: string, fd: FormData) {
  const saved = String(fd.get("saved") || "") === "1";
  await backendFetch(`/v1/volunteer/opportunities/${encodeURIComponent(id)}/save`, { method: saved ? "DELETE" : "POST" });
  revalidatePath(back(base, id));
  redirect(`${back(base, id)}${saved ? "" : "?flash=saved"}`);
}
