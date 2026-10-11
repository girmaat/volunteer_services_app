import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type InboxThread = {
  request_id: string | null;
  application_id: string | null;
  request_title: string | null;
  peer_id: string;
  peer_email: string;
  peer_display_name: string | null;
  peer_avatar_url: string | null;
  last_body: string | null;
  last_at: string;
  unread_count: number;
  last_sender_user_id: string;
};

async function getInbox(): Promise<InboxThread[]> {
  const res = await backendFetch("/v1/org/messages/inbox", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load org inbox");
  const data = await res.json();
  return (data?.threads || []) as InboxThread[];
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}



function threadHref(t: InboxThread) {
  const qs = new URLSearchParams();
  if (t.request_id) qs.set("requestId", t.request_id);
  if (t.application_id) qs.set("applicationId", t.application_id);
  const q = qs.toString();
  return `/org/messages/${t.peer_id}` + (q ? `?${q}` : "");
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const threads = await getInbox();

  return (
    <div>
      <h2>Org inbox</h2>

      {threads.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: 10, paddingLeft: 18 }}>
          {threads.map((t) => (
            <li key={`${t.peer_id}-${t.request_id || "none"}-${t.application_id || "none"}`}>
              <Link href={threadHref(t)}>{t.peer_display_name || t.peer_email}</Link>{" "}
              {t.request_title ? <span style={{ opacity: 0.8 }}>(Regarding: {t.request_title})</span> : null}{" "}
              {t.unread_count ? <strong>({t.unread_count} new)</strong> : null}
              <div style={{ opacity: 0.7, marginTop: 4 }}>
                {t.last_body ? t.last_body.slice(0, 120) : ""} · {formatWhen(t.last_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

