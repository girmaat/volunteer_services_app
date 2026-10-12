import { Pagination } from "../../../components/ui/Table";
import { setBackgroundCheck, shadowBan } from "../_actions";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

type AdminUser = {
  id: string;
  shadow_banned?: boolean;
  background_check_status?: string | null;
  email: string;
  display_name: string | null;
  role: string | null;
  account_type: string | null;
  requester_mode: string | null;
  onboarding_completed: boolean;
  verification_required: boolean;
  verification_status: "not_required" | "required" | "submitted" | "approved" | "rejected" | string;
  strike_count: number;
  banned_until: string | null;
  banned_reason: string | null;
  platform_admin_role: "admin" | "super" | null;
  created_at: string;
};

type UsersResponse = {
  users: AdminUser[];
  limit: number;
  offset: number;
  total: number;
};

type Flash = { type: "success" | "error"; message: string; at: number };

function encodeFlash(f: Flash) {
  return Buffer.from(JSON.stringify(f), "utf-8").toString("base64url");
}
function decodeFlash(raw: string | undefined): Flash | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as Flash;
    if (!parsed || (parsed.type !== "success" && parsed.type !== "error")) return null;
    if (typeof parsed.message !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function setFlash(type: Flash["type"], message: string) {
  (await cookies()).set("admin_users_flash", encodeFlash({ type, message, at: Date.now() }), {
    path: "/admin/users",
    maxAge: 12, // short-lived (avoids querystring messages)
    sameSite: "lax"
  });
}

function asString(val: any): string {
  if (Array.isArray(val)) return String(val[0] ?? "");
  return typeof val === "string" ? val : "";
}

function buildQuery(params: Record<string, string>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function loadUsers(query: Record<string, string>): Promise<{ data: UsersResponse | null; error?: string }> {
  const url = `/v1/admin/users${buildQuery(query)}`;
  const res = await backendFetch(url, { method: "GET" });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    return { data: null, error: String(json?.message || "Failed to load users") };
  }
  const json = (await res.json()) as UsersResponse;
  return { data: json, error: undefined };
}

function badgeForUser(u: AdminUser) {
  if (u.banned_until && new Date(u.banned_until).getTime() > Date.now()) return <span className="badge badgeBad">Banned</span>;
  if (u.strike_count >= 3) return <span className="badge badgeWarn">Strikes: {u.strike_count}</span>;
  return u.strike_count > 0 ? <span className="badge">Strikes: {u.strike_count}</span> : <span className="badge badgeOk">OK</span>;
}

export default async function Page(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) redirect("/403");

  const q = asString(searchParams?.q).trim();

  const admin_role = asString(searchParams?.admin_role).trim(); // admin|super|none|''
  const banned = asString(searchParams?.banned).trim(); // banned|not_banned|''
  const verification_status = asString(searchParams?.verification_status).trim();
  const verification_required = asString(searchParams?.verification_required).trim(); // required|not_required|''
  const onboarding = asString(searchParams?.onboarding).trim(); // complete|incomplete|''
  const account_type = asString(searchParams?.account_type).trim();

  const sort = asString(searchParams?.sort).trim() || "created_at";
  const dir = (asString(searchParams?.dir).trim().toLowerCase() === "asc" ? "asc" : "desc") as "asc" | "desc";

  const query = {
    q,
    admin_role,
    banned,
    verification_status,
    verification_required,
    onboarding,
    account_type,
    sort,
    dir
  };
  const PAGE_SIZE = 50;
  const page = Math.max(1, Number(asString(searchParams?.page)) || 1);

  const { data, error: loadError } = await loadUsers({ ...query, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
  const users = data?.users || [];
  const total = data?.total ?? 0;

  const flash = decodeFlash((await cookies()).get("admin_users_flash")?.value);

  async function grantAdminAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const role = String(formData.get("role") || "admin");
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/grant-admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role })
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      await setFlash("error", String(json?.message || "Failed to update admin role"));
      redirect(`/admin/users${buildQuery(query)}`);
    }
    revalidatePath("/admin/users");
    await setFlash("success", "Admin role updated.");
    redirect(`/admin/users${buildQuery(query)}`);
  }

  async function revokeAdminAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/revoke-admin`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      await setFlash("error", String(json?.message || "Failed to revoke admin"));
      redirect(`/admin/users${buildQuery(query)}`);
    }
    revalidatePath("/admin/users");
    await setFlash("success", "Admin access revoked.");
    redirect(`/admin/users${buildQuery(query)}`);
  }

  async function strikeAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const reason = String(formData.get("reason") || "").trim();
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/strike`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined })
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      await setFlash("error", String(json?.message || "Failed to apply strike"));
      redirect(`/admin/users${buildQuery(query)}`);
    }
    revalidatePath("/admin/users");
    await setFlash("success", "Strike applied.");
    redirect(`/admin/users${buildQuery(query)}`);
  }

  async function clearStrikesAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/clear-strikes`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      await setFlash("error", String(json?.message || "Failed to clear strikes"));
      redirect(`/admin/users${buildQuery(query)}`);
    }
    revalidatePath("/admin/users");
    await setFlash("success", "Strikes cleared.");
    redirect(`/admin/users${buildQuery(query)}`);
  }

  async function banAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const days = Number(formData.get("days") || 0);
    const reason = String(formData.get("reason") || "").trim();
    const until = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : undefined;

    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/ban`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ until, reason: reason || undefined })
    });

    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      await setFlash("error", String(json?.message || "Failed to ban user"));
      redirect(`/admin/users${buildQuery(query)}`);
    }
    revalidatePath("/admin/users");
    await setFlash("success", "User banned.");
    redirect(`/admin/users${buildQuery(query)}`);
  }

  async function unbanAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/unban`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      await setFlash("error", String(json?.message || "Failed to unban user"));
      redirect(`/admin/users${buildQuery(query)}`);
    }
    revalidatePath("/admin/users");
    await setFlash("success", "User unbanned.");
    redirect(`/admin/users${buildQuery(query)}`);
  }

  async function deleteUserAction(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const confirm = String(formData.get("confirm") || "").trim();
    if (confirm !== "DELETE") {
      await setFlash("error", "Type DELETE to confirm.");
      redirect(`/admin/users${buildQuery(query)}`);
    }

    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE" })
    });

    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      await setFlash("error", String(json?.message || "Failed to delete user"));
      redirect(`/admin/users${buildQuery(query)}`);
    }
    revalidatePath("/admin/users");
    await setFlash("success", "User deleted.");
    redirect(`/admin/users${buildQuery(query)}`);
  }

  return (
    <div className="adminGrid">
      <header className="flex justify-between gap-3 flex-wrap items-baseline">
        <div>
          <h1 className="m-0">User management</h1>
          <p className="muted mt-1.5 mb-0">
            Search users, filter/sort results, manage admin access, and apply strikes / bans.
          </p>
          {typeof total === "number" ? (
            <div className="muted text-xs mt-1.5">
              Showing {users.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{(page - 1) * PAGE_SIZE + users.length} of {total} matching users.
            </div>
          ) : null}
        </div>

        <form className="flex gap-2 items-center flex-wrap justify-end" method="get" action="/admin/users">
          <input className="input w-[260px]" name="q" aria-label="Q" placeholder="Search email or display name" defaultValue={q} />

          <select className="input" name="admin_role" aria-label="Admin role" defaultValue={admin_role || ""}>
            <option value="">Admin: Any</option>
            <option value="super">Admin: Super</option>
            <option value="admin">Admin: Admin</option>
            <option value="none">Admin: None</option>
          </select>

          <select className="input" name="banned" aria-label="Banned" defaultValue={banned || ""}>
            <option value="">Ban: Any</option>
            <option value="banned">Ban: Active</option>
            <option value="not_banned">Ban: Not banned</option>
          </select>

          <select className="input" name="verification_status" aria-label="Verification status" defaultValue={verification_status || ""}>
            <option value="">Verification: Any</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="required">Required</option>
            <option value="not_required">Not required</option>
          </select>

          <select className="input" name="onboarding" aria-label="Onboarding" defaultValue={onboarding || ""}>
            <option value="">Onboarding: Any</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
          </select>

          <select className="input" name="sort" aria-label="Sort" defaultValue={sort}>
            <option value="created_at">Sort: Created</option>
            <option value="updated_at">Sort: Updated</option>
            <option value="email">Sort: Email</option>
            <option value="display_name">Sort: Display name</option>
            <option value="strike_count">Sort: Strikes</option>
            <option value="banned_until">Sort: Ban until</option>
            <option value="verification_status">Sort: Verification</option>
            <option value="admin_role">Sort: Admin role</option>
          </select>

          <select className="input" name="dir" aria-label="Dir" defaultValue={dir}>
            <option value="desc">↓ Desc</option>
            <option value="asc">↑ Asc</option>
          </select>

          <button className="btn" type="submit">Apply</button>
          <a className="btn btnGhost" href="/admin/users">Clear</a>
        </form>
      </header>

      {flash ? (
        <div className={`adminCard ${flash.type === "error" ? "border-danger bg-danger-tint" : "border-success bg-success-tint"}`} role={flash.type === "error" ? "alert" : "status"}>
          <strong>{flash.type === "error" ? "Action failed" : "Success"}</strong>
          <div className="muted mt-1.5">{flash.message}</div>
        </div>
      ) : null}

      {loadError ? (
        <div className="adminCard border-danger bg-danger-tint">
          <strong>Failed to load users</strong>
          <div className="muted mt-1.5">{loadError}</div>
        </div>
      ) : null}



      <div className="adminCard">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Type</th>
              <th>Trust</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted p-4">
                  No users match the current filters.
                </td>
              </tr>
            ) : null}

            {users.map((u) => {
              const isSelf = u.id === me?.id;
              const isAdmin = Boolean(u.platform_admin_role);
              const isSuper = u.platform_admin_role === "super";
              const clearStrikesDisabled = u.strike_count === 0;

              const clearStrikesReason = clearStrikesDisabled ? "User has no strikes to clear." : "";
              const grantAdminDisabled = isAdmin;
              const grantAdminReason = isSuper ? "User is already a super admin." : isAdmin ? "User is already an admin." : "";
              const grantSuperDisabled = isSuper;
              const grantSuperReason = isSuper ? "User is already a super admin." : "";
              const revokeDisabled = !isAdmin || isSelf;
              const revokeReason = isSelf ? "You can’t revoke your own admin access." : !isAdmin ? "User is not an admin." : "";

              return (
                <tr key={u.id}>
                  <td>
                    <div className="font-extrabold">{u.display_name || u.email}</div>
                    <div className="muted text-xs">{u.email}</div>
                    <div className="muted text-xs mt-1">{new Date(u.created_at).toLocaleDateString()}</div>
                  </td>
                  <td className="muted text-xs">
                    {u.account_type || u.role || "—"}
                    {u.requester_mode ? ` · ${u.requester_mode}` : ""}
                  </td>
                  <td>{badgeForUser(u)}</td>
                  <td className="muted text-xs">{u.platform_admin_role || "—"}</td>
                  <td>
                    <div className="adminActions">
                      <form action={strikeAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        <input className="input" name="reason" aria-label="Reason" placeholder="Strike reason (optional)" />
                        <button className="btn" type="submit">Strike</button>
                      </form>

                      <form action={clearStrikesAction}>
                        <input type="hidden" name="user_id" value={u.id} />
                        {clearStrikesDisabled ? (
                          <span className="inline-block" title={clearStrikesReason}>
                            <button className="btn" type="submit" disabled>Clear strikes</button>
                          </span>
                        ) : (
                          <button className="btn" type="submit">Clear strikes</button>
                        )}
                      </form>

                      <form action={shadowBan.bind(null, u.id, !u.shadow_banned, "/admin/users")}>
                        <button className="btn" type="submit" title="Their requests and messages stay visible only to them">
                          {u.shadow_banned ? "Lift shadow-ban" : "Shadow-ban"}
                        </button>
                      </form>

                      <form action={setBackgroundCheck.bind(null, u.id, "/admin/users")}>
                        <select className="input" name="status" aria-label="Background check" defaultValue={u.background_check_status || "none"}>
                          <option value="none">Background check: none</option>
                          <option value="pending">Background check: pending</option>
                          <option value="cleared">Background check: cleared</option>
                          <option value="expired">Background check: expired</option>
                        </select>
                        <button className="btn" type="submit">Save</button>
                      </form>

                      {u.banned_until && new Date(u.banned_until).getTime() > Date.now() ? (
                        <form action={unbanAction}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <button className="btn" type="submit">Unban</button>
                        </form>
                      ) : (
                        <form action={banAction}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input className="input" name="reason" aria-label="Reason" placeholder="Ban reason (optional)" />
                          <select className="input" name="days" aria-label="Days" defaultValue="7">
                            <option value="1">1 day</option>
                            <option value="7">7 days</option>
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                          </select>
                          <button className="btn btnDanger" type="submit">Ban</button>
                        </form>
                      )}

                      {me?.is_super_admin ? (
                        <>
                          <form action={grantAdminAction}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="role" value="admin" />
                            {grantAdminDisabled ? (
                              <span className="inline-block" title={grantAdminReason}>
                                <button className="btn" type="submit" disabled>Grant admin</button>
                              </span>
                            ) : (
                              <button className="btn" type="submit">Grant admin</button>
                            )}
                          </form>

                          <form action={grantAdminAction}>
                            <input type="hidden" name="user_id" value={u.id} />
                            <input type="hidden" name="role" value="super" />
                            {grantSuperDisabled ? (
                              <span className="inline-block" title={grantSuperReason}>
                                <button className="btn btnSoft" type="submit" disabled>Grant super</button>
                              </span>
                            ) : (
                              <button className="btn btnSoft" type="submit">Grant super</button>
                            )}
                          </form>

                          <form action={revokeAdminAction}>
                            <input type="hidden" name="user_id" value={u.id} />
                            {revokeDisabled ? (
                              <span className="inline-block" title={revokeReason}>
                                <button className="btn" type="submit" disabled>Revoke admin</button>
                              </span>
                            ) : (
                              <button className="btn" type="submit">Revoke admin</button>
                            )}
                          </form>

                          {/* Hard delete: super admins only; requires typing DELETE to confirm (no JS) */}
                          {isSelf ? (
                            <span className="inline-block" title="You cannot delete yourself">
                              <button className="btn" type="button" disabled>Delete</button>
                            </span>
                          ) : (
                            <details className="inline-block">
                              <summary className="btn btnDanger list-none cursor-pointer">Delete</summary>
                              <div className="adminCard mt-2 p-3 min-w-[320px]">
                                <div className="font-extrabold">Delete user</div>
                                <div className="muted text-xs mt-1.5">
                                  This permanently deletes the user and cascades to related records. Type <strong>DELETE</strong> to confirm.
                                </div>
                                <form className="flex gap-2 items-center mt-2.5" action={deleteUserAction}>
                                  <input type="hidden" name="user_id" value={u.id} />
                                  <input className="input" name="confirm" aria-label="Confirm" placeholder="Type DELETE" />
                                  <button className="btn btnDanger" type="submit">Confirm</button>
                                </form>
                              </div>
                            </details>
                          )}
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/admin/users" params={query} page={page} hasNext={page * PAGE_SIZE < total} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
