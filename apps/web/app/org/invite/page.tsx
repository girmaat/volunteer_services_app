import { backendFetch, getCurrentUser } from "../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type InviteLookup = {
  org: { slug: string; name: string };
  role: string;
  invited_email: string | null;
  expires_at: string | null;
};

async function lookupInvite(token: string): Promise<InviteLookup | null> {
  const res = await backendFetch(`/v1/public/org-invites/lookup?token=${encodeURIComponent(token)}`, { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as InviteLookup;
}

export default async function Page(props: { searchParams?: Promise<{ token?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const token = String(searchParams?.token || "").trim();
  if (!token) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1>Organization invite</h1>
        <p>Missing invite token.</p>
      </div>
    );
  }

  const invite = await lookupInvite(token);

  async function acceptInviteAction() {
    "use server";
    const res = await backendFetch("/v1/org/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to accept invite"));
      redirect(`/org/invite?token=${encodeURIComponent(token)}&error=${msg}`);
    }

    revalidatePath("/org");
    redirect("/org/dashboard");
  }

  const user = await getCurrentUser();
  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";

  return (
    <div style={{ maxWidth: 720, display: "grid", gap: 12 }}>
      <header>
        <h2 style={{ margin: 0 }}>Organization invite</h2>
        <p style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>
          {invite ? (
            <>
              You&apos;ve been invited to join <strong>{invite.org.name}</strong> as a <strong>{invite.role}</strong>.
            </>
          ) : (
            <>This invite link is invalid or expired.</>
          )}
        </p>
      </header>

      {invite ? (
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 13, color: "rgba(0,0,0,0.75)" }}>
            {invite.invited_email ? (
              <>
                Sent to: <strong>{invite.invited_email}</strong>
              </>
            ) : null}
          </div>
          {invite.expires_at ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.6)" }}>
              Expires: {new Date(invite.expires_at).toLocaleString()}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div style={{ border: "1px solid rgba(180,0,0,0.35)", background: "rgba(180,0,0,0.05)", borderRadius: 12, padding: 12 }}>
          <strong>Couldn&apos;t accept invite.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      {!invite ? null : !user ? (
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}>
          <p style={{ margin: 0 }}>Please log in (or create an account) using the invited email address, then return to this link.</p>
          <div style={{ marginTop: 10 }}>
            <a href="/login" style={{ fontWeight: 700 }}>
              Go to login
            </a>
          </div>
        </div>
      ) : (
        <form action={acceptInviteAction}>
          <button
            type="submit"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.25)",
              background: "white",
              fontWeight: 800
            }}
          >
            Accept invite
          </button>
        </form>
      )}
    </div>
  );
}
