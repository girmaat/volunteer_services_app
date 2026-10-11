import { backendFetch, getCurrentUser } from "../../../lib/backend";
import { getOrgContext } from "../../../lib/org";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Msg = {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender_full_name: string | null;
};

type ThreadResp = {
  context: { request_id: string; request_title: string; application_id: string | null } | null;
  messages: Msg[];
};

async function load(peerId: string, requestId?: string, applicationId?: string): Promise<ThreadResp> {
  const qs = new URLSearchParams();
  if (requestId) qs.set("requestId", requestId);
  if (applicationId) qs.set("applicationId", applicationId);
  const q = qs.toString();
  const res = await backendFetch(`/v1/org/messages/thread/${peerId}` + (q ? `?${q}` : ""), { method: "GET" });
  if (!res.ok) throw new Error("Failed to load thread");
  const data = await res.json();
  return { context: (data?.context || null) as any, messages: (data?.messages || []) as Msg[] };
}

async function sendAction(peerId: string, requestId: string | undefined, applicationId: string | undefined, formData: FormData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");

  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");

  const body = String(formData.get("body") || "").trim();
  if (!body) {
    const qs = new URLSearchParams();
    if (requestId) qs.set("requestId", requestId);
    if (applicationId) qs.set("applicationId", applicationId);
    const q = qs.toString();
    redirect(`/org/messages/${peerId}` + (q ? `?${q}` : ""));
  }

  const qs = new URLSearchParams();
  if (requestId) qs.set("requestId", requestId);
  if (applicationId) qs.set("applicationId", applicationId);
  const q = qs.toString();

  const res = await backendFetch(`/v1/org/messages/thread/${peerId}` + (q ? `?${q}` : ""), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });

  if (!res.ok) redirect(`/org/messages/${peerId}` + (q ? `?${q}&` : `?`) + `error=${encodeURIComponent("Send failed")}`);
  redirect(`/org/messages/${peerId}` + (q ? `?${q}` : ""));
}

export default async function Page(
  props: {
    params: Promise<{ peerId: string }>;
    searchParams?: Promise<{ error?: string; requestId?: string; applicationId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const requestId = typeof searchParams?.requestId === "string" ? searchParams?.requestId : undefined;
  const applicationId = typeof searchParams?.applicationId === "string" ? searchParams?.applicationId : undefined;

  const thread = await load(params.peerId, requestId, applicationId);
  const msgs = thread.messages;
  const context = thread.context;

  return (
    <div>
      <h2>Conversation</h2>
      {context?.request_id ? (
        <div style={{ opacity: 0.85, marginTop: 6 }}>
          <strong>Regarding:</strong>{" "}
          <Link href={`/org/requests/${context.request_id}`}>{context.request_title}</Link>
        </div>
      ) : null}
      {searchParams?.error ? <p style={{ color: "crimson" }}>{searchParams.error}</p> : null}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {msgs.map((m) => {
          const mine = m.sender_user_id === user.id;
          return (
            <div
              key={m.id}
              style={{
                padding: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 10,
                opacity: mine ? 1 : 0.95
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {mine ? "You" : m.sender_full_name || "Volunteer"} · {new Date(m.created_at).toLocaleString()}
              </div>
              <div style={{ marginTop: 6 }}>{m.body}</div>
            </div>
          );
        })}
      </div>

      <form action={sendAction.bind(null, params.peerId, requestId, applicationId)} style={{ display: "grid", gap: 8, marginTop: 12, maxWidth: 720 }}>
        <textarea name="body" rows={3} placeholder="Write a message…" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
