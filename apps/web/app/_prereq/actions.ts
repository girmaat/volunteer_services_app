"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";

const ok = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const safeBack = (b: string) => (/^\/volunteer\/(applications|opportunities)\/[0-9a-f-]{36}$/.test(b) ? b : "/volunteer/applications");
const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn’t go through. Try again.";

/** Sign the current version of a form: typed full name and an explicit "I agree". */
export async function signFormAction(requestId: string, docId: string, back: string, fd: FormData) {
  const to = safeBack(back);
  if (!ok(requestId) || !ok(docId)) redirect(to);
  const r = await backendFetch(`/v1/volunteer/documents/${docId}/sign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request_id: requestId, signer_name: String(fd.get("signer_name") || "").trim(), agree: fd.get("agree") === "yes" })
  });
  redirect(`${to}?${r.ok ? "flash=signed" : `error=${encodeURIComponent(await msg(r))}`}#prerequisites`);
}

/** Ask a parent or guardian for consent; they get an email with a link. */
export async function guardianAction(applicationId: string, fd: FormData) {
  if (!ok(applicationId)) redirect("/volunteer/applications");
  const r = await backendFetch(`/v1/volunteer/applications/${applicationId}/guardian`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ guardianName: String(fd.get("guardianName") || "").trim(), guardianEmail: String(fd.get("guardianEmail") || "").trim(), relationship: String(fd.get("relationship") || "parent") })
  });
  if (!r.ok) redirect(`/volunteer/applications/${applicationId}?error=${encodeURIComponent(await msg(r))}#prerequisites`);
  const d = (await r.json()) as { dev_consent_url?: string };
  redirect(`/volunteer/applications/${applicationId}?flash=guardian${d.dev_consent_url ? `&dev=${encodeURIComponent(d.dev_consent_url)}` : ""}#prerequisites`);
}

/** Take or turn down a spot offered from the waitlist. */
export async function offerAction(applicationId: string, accept: boolean) {
  if (!ok(applicationId)) redirect("/volunteer/applications");
  const r = await backendFetch(`/v1/volunteer/applications/${applicationId}/offer`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accept }) });
  redirect(`/volunteer/applications/${applicationId}?${r.ok ? `flash=${accept ? "offer_accepted" : "offer_declined"}` : `error=${encodeURIComponent(await msg(r))}`}`);
}
