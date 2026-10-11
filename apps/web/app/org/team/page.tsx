import { revalidatePath } from "next/cache";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";

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
  if (user.role !== "org_admin") redirect("/dashboard");

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
    <div style={{ display: "grid", gap: 14 }}>
      <header>
        <h1 style={{ margin: 0 }}>Team</h1>
        <p style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>
          Add teammates to help manage requests and messages. Invited members must accept the email invite before they can access the org area.
        </p>
      </header>

      {error ? (
        <div style={{ border: "1px solid rgba(180,0,0,0.35)", background: "rgba(180,0,0,0.05)", borderRadius: 12, padding: 12 }}>
          <strong>Couldn&apos;t complete that action.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      {showSent ? (
        <div style={{ border: "1px solid rgba(0,120,0,0.35)", background: "rgba(0,120,0,0.05)", borderRadius: 12, padding: 12 }}>
          <strong>Invite sent.</strong>
          {devInviteUrl ? (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,0.7)" }}>Local dev link (SMTP not configured):</div>
              <code style={{ display: "block", marginTop: 6, wordBreak: "break-all" }}>{devInviteUrl}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      <section style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Invite a teammate</h2>

        {!canManage ? (
          <p style={{ margin: 0, color: "rgba(0,0,0,0.7)" }}>Only org admins and managers can invite teammates.</p>
        ) : (
          <form action={inviteMemberAction} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <label style={{ display: "grid", gap: 6 }}>
              Email
              <input name="email" type="email" required style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Role
              <select name="role" aria-label="Role" defaultValue="member" style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }}>
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)", background: "white", fontWeight: 700 }}>
              Send invite
            </button>
          </form>
        )}
      </section>

      <section style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Active members</h2>
        {active.length === 0 ? (
          <p style={{ margin: 0, color: "rgba(0,0,0,0.7)" }}>No active members found.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {active.map((m) => (
              <div key={m.member_id} style={{ display: "grid", gap: 6, padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.full_name || m.email}</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)" }}>{m.email}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)" }}>Status: Active</div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <form action={updateRoleAction} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="hidden" name="user_id" value={m.user_id || ""} />
                    <select name="role" aria-label="Role" defaultValue={m.role} disabled={!canManage} style={{ padding: 8, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }}>
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button type="submit" disabled={!canManage} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)", background: "white" }}>
                      Update
                    </button>
                  </form>

                  {data.membership.role === "admin" && m.email !== user.email ? (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="user_id" value={m.user_id || ""} />
                      <button type="submit" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(180,0,0,0.35)", background: "rgba(180,0,0,0.05)" }}>
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

      <section style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Pending invites</h2>
        {invited.length === 0 ? (
          <p style={{ margin: 0, color: "rgba(0,0,0,0.7)" }}>No pending invites.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {invited.map((m) => (
              <div key={m.member_id} style={{ display: "grid", gap: 6, padding: 12, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.email}</div>
                    <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)" }}>Role: {m.role}</div>
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.65)" }}>Status: Invited</div>
                </div>

                {canManage ? (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <form action={resendInviteAction}>
                      <input type="hidden" name="member_id" value={m.member_id} />
                      <button type="submit" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)", background: "white" }}>
                        Resend
                      </button>
                    </form>
                    <form action={cancelInviteAction}>
                      <input type="hidden" name="member_id" value={m.member_id} />
                      <button type="submit" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(180,0,0,0.35)", background: "rgba(180,0,0,0.05)" }}>
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
