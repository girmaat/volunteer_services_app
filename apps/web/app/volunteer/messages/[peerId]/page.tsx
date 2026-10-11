import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backendFetch } from "../../../lib/backend";
import styles from "../../volunteer.module.css";

export const dynamic = "force-dynamic";

type ThreadResponse = {
  peer: { id: string; email: string; display_name: string | null; avatar_url: string | null; public_location: string | null };
  context: { request_id: string; request_title: string; application_id: string | null } | null;
  messages: {
    id: string;
    sender_user_id: string;
    recipient_user_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
  }[];
};

type ThreadState =
  | { kind: "ok"; data: ThreadResponse }
  | { kind: "blocked" }
  | { kind: "not_found" };

async function getThread(peerId: string, requestId?: string, applicationId?: string): Promise<ThreadState> {
  const qs = new URLSearchParams();
  if (requestId) qs.set("requestId", requestId);
  if (applicationId) qs.set("applicationId", applicationId);
  const q = qs.toString();
  const res = await backendFetch(`/v1/volunteer/messages/thread/${peerId}` + (q ? `?${q}` : ""), { method: "GET" });
  if (res.status === 403) return { kind: "blocked" };
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) {
    throw new Error("Failed to load message thread");
  }
  return { kind: "ok", data: (await res.json()) as ThreadResponse };
}

export default async function Page(
  props: { params: Promise<{ peerId: string }>; searchParams?: Promise<{ error?: string; requestId?: string; applicationId?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const peerId = params.peerId;
  const requestId = typeof searchParams?.requestId === "string" ? searchParams?.requestId : undefined;
  const applicationId = typeof searchParams?.applicationId === "string" ? searchParams?.applicationId : undefined;
  const state = await getThread(peerId, requestId, applicationId);

  if (state.kind === "blocked") {
    return (
      <>
        <h2 className={styles.sectionTitle}>Conversation unavailable</h2>
        <p className={styles.meta}>
          This conversation is unavailable because one of you has blocked the other.
        </p>
        <Link className={styles.button} href="/settings/blocked-users">
          Manage blocked users
        </Link>
      </>
    );
  }

  if (state.kind === "not_found") {
    return (
      <>
        <h2 className={styles.sectionTitle}>Conversation not found</h2>
        <p className={styles.meta}>The user or thread could not be found.</p>
        <Link className={styles.button} href="/volunteer/messages">
          Back to inbox
        </Link>
      </>
    );
  }

  if (state.kind !== "ok") return null;
  const data = state.data;

  async function sendMessage(formData: FormData) {
    "use server";

    const body = String(formData.get("body") || "").trim();
    if (!body) return;

    const qs = new URLSearchParams();
    if (requestId) qs.set("requestId", requestId);
    if (applicationId) qs.set("applicationId", applicationId);
    const q = qs.toString();

    const res = await backendFetch(`/v1/volunteer/messages/thread/${peerId}` + (q ? `?${q}` : ""), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body })
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as any;
      const msg = data?.message || "Failed to send message.";
      if (res.status === 403) {
        redirect(`/volunteer/messages/${peerId}` + (q ? `?${q}&` : `?`) + `error=` + encodeURIComponent(msg));
      }
      throw new Error(msg);
    }

    revalidatePath(`/volunteer/messages/${peerId}`);
    revalidatePath(`/volunteer/messages`);
    revalidatePath(`/volunteer/dashboard`);
  }

  return (
    <>
      <h2 className={styles.sectionTitle}>{data.peer.display_name || data.peer.email}</h2>
      {data.context?.request_id ? (
        <div className={styles.banner} style={{ marginTop: "0.75rem" } as any}>
          <strong>Regarding:</strong>{" "}
          <Link href={`/volunteer/opportunities/${data.context.request_id}`}>{data.context.request_title}</Link>
        </div>
      ) : null}
      {searchParams?.error ? (
        <div className={styles.banner} style={{ marginTop: "0.75rem" } as any}>
          <strong>Could not send</strong>
          <p className={styles.small} style={{ marginTop: "0.35rem" } as any}>
            {searchParams.error}
          </p>
        </div>
      ) : null}
      {data.peer.public_location ? (
        <p className={styles.meta} style={{ marginTop: "-0.5rem" } as any}>
          {data.peer.public_location}
        </p>
      ) : null}

      <div className={styles.list}>
        {data.messages.length === 0 ? (
          <div className={styles.tile}>
            <p className={styles.tileBody}>No messages yet.</p>
          </div>
        ) : (
          data.messages.map((m) => (
            <div key={m.id} className={styles.tile}>
              <p className={styles.meta} style={{ marginBottom: "0.35rem" } as any}>
                <strong>{m.sender_user_id === data.peer.id ? (data.peer.display_name || data.peer.email) : "You"}</strong> ·{" "}
                {new Date(m.created_at).toLocaleString()}
              </p>
              <p className={styles.tileBody}>{m.body}</p>
            </div>
          ))
        )}
      </div>

      
      <div className={styles.banner}>
        <strong>Safety reminder</strong>
        <p className={styles.small} style={{ marginTop: "0.35rem" } as any}>
          Keep communication respectful and avoid sharing sensitive personal or financial details. If something feels unsafe or
          suspicious, you can <Link href="/trust-safety">report a concern</Link>.
        </p>
      </div>

      <form className={styles.form} action={sendMessage}>
        <textarea className={styles.textarea} name="body" placeholder="Write a message…" required />
        <button className={styles.button} type="submit">
          Send
        </button>
      </form>
    </>
  );
}






