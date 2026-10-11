import "server-only";

import { redirect } from "next/navigation";
import { backendFetch, getOnboardingProfile } from "../../lib/backend";

export const dynamic = "force-dynamic";

export function safeMessage(err: any, fallback: string) {
  const msg = String(err?.message || err?.error?.message || "").trim();
  return msg ? msg : fallback;
}

export async function requireOrgContextOrRedirect() {
  const res = await backendFetch("/v1/org/me", { method: "GET", cache: "no-store" });

  if (res.status === 401) redirect("/login");
  if (res.status === 403) redirect("/onboarding");

  if (!res.ok) {
    redirect("/org/signup");
  }

  const ctx = await res.json().catch(() => null);
  if (!ctx?.org?.slug) redirect("/org/signup");
  return ctx as any;
}

export async function getAdminProfile() {
  return await getOnboardingProfile();
}

export type FlashKind = "error" | "saved";
export type FlashSearchParams = {
  flashKind?: string | string[];
  flashMessage?: string | string[];
};

export function flashRedirect(path: string, kind: FlashKind, message: string): never {
  const params = new URLSearchParams({
    flashKind: kind,
    flashMessage: message
  });
  redirect(`${path}?${params.toString()}`);
}

export async function readFlash(
  searchParams?: FlashSearchParams | Promise<FlashSearchParams>
): Promise<{ kind: FlashKind; message: string } | null> {
  const resolved = await Promise.resolve(searchParams || {});
  const rawKind = Array.isArray(resolved.flashKind) ? resolved.flashKind[0] : resolved.flashKind;
  const rawMessage = Array.isArray(resolved.flashMessage) ? resolved.flashMessage[0] : resolved.flashMessage;

  const kind: FlashKind | null = rawKind === "saved" ? "saved" : rawKind === "error" ? "error" : null;
  const message = String(rawMessage || "").trim();

  if (!kind || !message) return null;
  return { kind, message };
}
