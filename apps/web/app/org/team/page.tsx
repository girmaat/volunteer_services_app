import { inOrg } from "../../../lib/access";
import { revalidatePath } from "next/cache";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";
import OrgTabs from "../../../components/org/OrgTabs";

export const dynamic = "force-dynamic";

type MemberRow = {
  member_id: string;
  user_id: string | null;
  invited_email: string | null;
  email: string;
  full_name: string | null;
  role: "admin" | "manager" | "member";
  status: "active" | "invited";
  created_at: string;
  updated_at: string;
};

type MembersResponse = {
  org: { slug: string; name: string };
  membership: { role: "admin" | "manager" | "member"; status: "active" | "invited" };
  members: MemberRow[];
};

async function getMembers(): Promise<MembersResponse> {
  const res = await backendFetch("/v1/org/members", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load org members");
  return (await res.json()) as MembersResponse;
}

function isAdminOrManager(role: string) {
  return role === "admin" || role === "manager";
}

export default async function Page(
  props: { searchParams?: Promise<{ sent?: string; devInviteUrl?: string; error?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!inOrg(user)) redirect("/dashboard");

  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const data = await getMembers();

  const canManage = isAdminOrManager(data.membership.role);

  async function inviteMemberAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const role = String(formData.get("role") || "member");

    const res = await backendFetch("/v1/org/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role })
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to send invite"));
      redirect(`/org/team?error=${msg}`);
    }

    revalidatePath("/org/team");
    const devInviteUrl = json?.dev_invite_url ? encodeURIComponent(String(json.dev_invite_url)) : "";
    redirect(`/org/team?sent=1${devInviteUrl ? `&devInviteUrl=${devInviteUrl}` : ""}`);
  }

  async function updateRoleAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const role = String(formData.get("role") || "");
    if (!userId) return;

    const res = await backendFetch(`/v1/org/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role })
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as any;
      const msg = encodeURIComponent(String(json?.message || "Failed to update role"));
      redirect(`/org/team?error=${msg}`);
    }

    revalidatePath("/org/team");
  }

  async function removeMemberAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    if (!userId) return;

    const res = await backendFetch(`/v1/org/members/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as any;
      const msg = encodeURIComponent(String(json?.message || "Failed to remove member"));
      redirect(`/org/team?error=${msg}`);
    }

    revalidatePath("/org/team");
  }

  async function cancelInviteAction(formData: FormData) {
    "use server";
    const memberId = String(formData.get("member_id") || "");
    if (!memberId) return;

    const res = await backendFetch(`/v1/org/members/invites/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as any;
      const msg = encodeURIComponent(String(json?.message || "Failed to cancel invite"));
      redirect(`/org/team?error=${msg}`);
    }

    revalidatePath("/org/team");
  }

  async function resendInviteAction(formData: FormData) {
    "use server";
    const memberId = String(formData.get("member_id") || "");
    if (!memberId) return;

    const res = await backendFetch(`/v1/org/members/invites/${memberId}/resend`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to resend invite"));
      redirect(`/org/team?error=${msg}`);
    }

    revalidatePath("/org/team");
    const devInviteUrl = json?.dev_invite_url ? encodeURIComponent(String(json.dev_invite_url)) : "";
    redirect(`/org/team?sent=1${devInviteUrl ? `&devInviteUrl=${devInviteUrl}` : ""}`);
  }

  const active = data.members.filter((m) => m.status === "active");
  const invited = data.members.filter((m) => m.status === "invited");

  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";
  const showSent = searchParams?.sent === "1";
  const devInviteUrl = searchParams?.devInviteUrl ? decodeURIComponent(String(searchParams.devInviteUrl)) : "";

  return (
    <div className="grid gap-3.5">
      <header>
        <h1 className="m-0">Team</h1>
        <p className="mt-1.5 text-muted">
          Add teammates to help manage requests and messages. Invited members must accept the email invite before they can access the org area.
        </p>
      </header>
      <OrgTabs role={ctx?.membership.role} />

      {error ? (
        <div className="border border-danger bg-danger-tint rounded-lg p-3">
          <strong>Couldn&apos;t complete that action.</strong>
          <div className="mt-1.5">{error}</div>
        </div>
      ) : null}

      {showSent ? (
        <div className="border border-success bg-success-tint rounded-lg p-3">
          <strong>Invite sent.</strong>
          {devInviteUrl ? (
            <div className="mt-2">
              <div className="text-xs text-muted">Local dev link (SMTP not configured):</div>
              <code className="block mt-1.5 break-all">{devInviteUrl}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="border border-line rounded-lg p-3.5">
        <h2 className="mt-0">Invite a teammate</h2>

        {!canManage ? (
          <p className="m-0 text-muted">Only org admins and managers can invite teammates.</p>
        ) : (
          <form className="grid gap-2.5 max-w-[520px]" action={inviteMemberAction}>
            <label className="grid gap-1.5">
              Email
              <input className="p-2.5 rounded-md border border-line" name="email" type="email" required />
            </label>

            <label className="grid gap-1.5">
              Role
              <select className="p-2.5 rounded-md border border-line" name="role" aria-label="Role" defaultValue="member">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <button className="py-2.5 px-3 rounded-md border border-line bg-surface font-bold" type="submit">
              Send invite
            </button>
          </form>
        )}
      </section>

      <section className="border border-line rounded-lg p-3.5">
        <h2 className="mt-0">Active members</h2>
        {active.length === 0 ? (
          <p className="m-0 text-muted">No active members found.</p>
        ) : (
          <div className="grid gap-2.5">
            {active.map((m) => (
              <div className="grid gap-1.5 p-3 rounded-lg border border-line" key={m.member_id}>
                <div className="flex justify-between gap-3 items-baseline flex-wrap">
                  <div>
                    <div className="font-bold">{m.full_name || m.email}</div>
                    <div className="text-xs text-muted">{m.email}</div>
                  </div>
                  <div className="text-xs text-muted">Status: Active</div>
                </div>

                <div className="flex gap-2.5 flex-wrap items-center">
                  <form className="flex gap-2 items-center" action={updateRoleAction}>
                    <input type="hidden" name="user_id" value={m.user_id || ""} />
                    <select className="p-2 rounded-md border border-line" name="role" aria-label="Role" defaultValue={m.role} disabled={!canManage}>
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="py-2 px-2.5 rounded-md border border-line bg-surface" type="submit" disabled={!canManage}>
                      Update
                    </button>
                  </form>

                  {data.membership.role === "admin" && m.email !== user.email ? (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="user_id" value={m.user_id || ""} />
                      <button className="py-2 px-2.5 rounded-md border border-danger bg-danger-tint" type="submit">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-line rounded-lg p-3.5">
        <h2 className="mt-0">Pending invites</h2>
        {invited.length === 0 ? (
          <p className="m-0 text-muted">No pending invites.</p>
        ) : (
          <div className="grid gap-2.5">
            {invited.map((m) => (
              <div className="grid gap-1.5 p-3 rounded-lg border border-line" key={m.member_id}>
                <div className="flex justify-between gap-3 items-baseline flex-wrap">
                  <div>
                    <div className="font-bold">{m.email}</div>
                    <div className="text-xs text-muted">Role: {m.role}</div>
                  </div>
                  <div className="text-xs text-muted">Status: Invited</div>
                </div>

                {canManage ? (
                  <div className="flex gap-2.5 flex-wrap">
                    <form action={resendInviteAction}>
                      <input type="hidden" name="member_id" value={m.member_id} />
                      <button className="py-2 px-2.5 rounded-md border border-line bg-surface" type="submit">
                        Resend
                      </button>
                    </form>
                    <form action={cancelInviteAction}>
                      <input type="hidden" name="member_id" value={m.member_id} />
                      <button className="py-2 px-2.5 rounded-md border border-danger bg-danger-tint" type="submit">
                        Cancel
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
