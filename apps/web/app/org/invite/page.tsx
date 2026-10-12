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
      <div className="max-w-[720px]">
        <h1>Organization invite</h1>
        <p>Missing invite token.</p>
      </div>
    );
  }

  const invite = await lookupInvite(token);

  async function acceptInviteAction(fd: FormData) {
    "use server";
    const res = await backendFetch("/v1/org/invites/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, adultConfirmed: fd.get("adultConfirmed") === "yes" })
    });

    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
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
    <div className="max-w-[720px] grid gap-3">
      <header>
        <h2 className="m-0">Organization invite</h2>
        <p className="mt-1.5 text-muted">
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
        <div className="border border-line rounded-lg p-3">
          <div className="text-xs text-muted">
            {invite.invited_email ? (
              <>
                Sent to: <strong>{invite.invited_email}</strong>
              </>
            ) : null}
          </div>
          {invite.expires_at ? (
            <div className="mt-1.5 text-xs text-muted">
              Expires: {new Date(invite.expires_at).toLocaleString()}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="border border-danger bg-danger-tint rounded-lg p-3">
          <strong>Couldn&apos;t accept invite.</strong>
          <div className="mt-1.5">{error}</div>
        </div>
      ) : null}

      {!invite ? null : !user ? (
        <div className="border border-line rounded-lg p-3">
          <p className="m-0">Please log in (or create an account) using the invited email address, then return to this link.</p>
          <div className="mt-2.5">
            <a className="font-bold" href="/login">
              Go to login
            </a>
          </div>
        </div>
      ) : (
        <form action={acceptInviteAction} className="grid gap-3">
          <label htmlFor="inv-adult" className="flex items-start gap-2 text-sm">
            <input id="inv-adult" name="adultConfirmed" value="yes" type="checkbox" required className="mt-1 h-4 w-4" />
            <span>I’m 18 or older. Organization team members must be adults.</span>
          </label>
          <button className="justify-self-start py-2.5 px-3.5 rounded-md border border-line bg-surface font-extrabold" type="submit">
            Accept invite
          </button>
        </form>
      )}
    </div>
  );
}
