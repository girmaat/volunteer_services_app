import { redirect } from "next/navigation";
import { backendFetch } from "../../lib/backend";

export const dynamic = "force-dynamic";

/** Opens (or creates) the conversation for a request + volunteer, then goes to it. */
export default async function Start(props: { searchParams?: Promise<{ requestId?: string; volunteerId?: string }> }) {
  const sp = (await props.searchParams) || {};
  if (!sp.requestId || !/^[0-9a-f-]{36}$/i.test(sp.requestId)) redirect("/inbox");
  const r = await backendFetch("/v1/inbox/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: sp.requestId, ...(sp.volunteerId && /^[0-9a-f-]{36}$/i.test(sp.volunteerId) ? { volunteerUserId: sp.volunteerId } : {}) })
  });
  if (!r.ok) redirect(`/inbox?error=${encodeURIComponent("That conversation isn't available.")}`);
  const c = (await r.json()) as { id: string };
  redirect(`/inbox/${c.id}`);
}
