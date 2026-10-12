"use server";

import { revalidatePath } from "next/cache";
import { backendFetch } from "../../lib/backend";

export type TwoStepState =
  | { view: "idle"; error?: string; done?: "on" | "off" }
  | { view: "scan"; secret: string; error?: string }
  | { view: "codes"; codes: string[] };

const message = async (r: Response, fallback: string) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || fallback;
const post = (path: string, body: object) => backendFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });

/** One action for every step, so the secret and recovery codes live only in this form's state. */
export async function twoStepAction(prev: TwoStepState, fd: FormData): Promise<TwoStepState> {
  const step = String(fd.get("step") || "");
  if (step === "setup") {
    const r = await post("/v1/me/mfa/setup", { password: String(fd.get("password") || "") });
    if (!r.ok) return { view: "idle", error: await message(r, "That didn’t work. Try again.") };
    const j = (await r.json()) as { secret: string };
    return { view: "scan", secret: j.secret };
  }
  if (step === "enable" && prev.view === "scan") {
    const r = await post("/v1/me/mfa/enable", { code: String(fd.get("code") || "") });
    if (!r.ok) return { ...prev, error: await message(r, "That code didn’t work.") };
    const j = (await r.json()) as { recovery_codes: string[] };
    revalidatePath("/settings/account");
    return { view: "codes", codes: j.recovery_codes };
  }
  if (step === "disable") {
    const r = await post("/v1/me/mfa/disable", { password: String(fd.get("password") || ""), code: String(fd.get("code") || "") });
    if (!r.ok) return { view: "idle", error: await message(r, "That didn’t work. Try again.") };
    revalidatePath("/settings/account");
    return { view: "idle", done: "off" };
  }
  if (step === "finish") return { view: "idle", done: "on" };
  return { view: "idle" };
}
