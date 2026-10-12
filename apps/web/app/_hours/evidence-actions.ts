"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeLocalPath } from "../../lib/safePath";
import { backendFetch } from "../lib/backend";

const UUID = /^[0-9a-f-]{36}$/i;
const message = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn’t save. Try again.";

/** Back to the page the form was on, with a flash or an error, at the contribution's anchor. */
function back(to: string, query: string): never {
  const path = safeLocalPath(to, "/volunteer/history");
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  revalidatePath(base.split("?")[0]);
  redirect(`${base}${sep}${query}${hash ? `#${hash}` : ""}`);
}

/** Adds evidence: a file when one is chosen, otherwise a link. */
export async function addEvidenceAction(contributionId: string, to: string, fd: FormData) {
  if (!UUID.test(contributionId)) back(to, "error=" + encodeURIComponent("Not found"));
  const label = String(fd.get("label") || "").trim().slice(0, 120);
  const file = fd.get("file");
  let r: Response;
  if (file instanceof File && file.size) {
    const out = new FormData();
    out.set("file", file, file.name);
    if (label) out.set("label", label);
    r = await backendFetch(`/v1/contributions/${contributionId}/evidence/file`, { method: "POST", body: out });
  } else {
    const url = String(fd.get("url") || "").trim();
    if (!url) back(to, "error=" + encodeURIComponent("Add a link or choose a file"));
    r = await backendFetch(`/v1/contributions/${contributionId}/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, ...(label ? { label } : {}) })
    });
  }
  back(to, r.ok ? "flash=evidence" : "error=" + encodeURIComponent(await message(r)));
}

export async function removeEvidenceAction(contributionId: string, evidenceId: string, to: string) {
  if (!UUID.test(contributionId) || !UUID.test(evidenceId)) back(to, "error=" + encodeURIComponent("Not found"));
  const r = await backendFetch(`/v1/contributions/${contributionId}/evidence/${evidenceId}`, { method: "DELETE" });
  back(to, r.ok ? "flash=evidence_removed" : "error=" + encodeURIComponent(await message(r)));
}
