import "server-only";
import { backendFetch } from "../app/lib/backend";

import type { Category, OwnerRequest } from "@thankyou/contracts";
export type { Category, OwnerRequest };

export async function getCategories(): Promise<Category[]> {
  const r = await backendFetch("/v1/public/categories");
  if (!r.ok) return [];
  return ((await r.json()) as { categories: Category[] }).categories;
}

export async function getOwnerRequest(id: string): Promise<OwnerRequest | null> {
  const r = await backendFetch(`/v1/requests/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  return (await r.json()) as OwnerRequest;
}

export const STATUS_HELP: Record<string, string> = {
  draft: "Only you can see this draft.",
  open: "Live. Volunteers can find it and apply.",
  pending: "Some spots are filled; still taking applicants.",
  filled: "Every spot is filled. New applicants join the waitlist.",
  paused: "Hidden from search while paused.",
  completed: "Done. Reviews open for 14 days.",
  canceled: "Canceled. Applicants were told."
};
