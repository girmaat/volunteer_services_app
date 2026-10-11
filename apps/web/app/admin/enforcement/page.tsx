import { backendFetch, getCurrentUser } from "../../lib/backend";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export const dynamic = "force-dynamic";

const FLASH_COOKIE = "ty_admin_enforcement_flash";

type BannedUser = {
  id: string;
  email: string;
  display_name: string | null;
  banned_until: string;
  banned_reason: string | null;
  strike_count: number;
};

type EnforcementAction = {
  id: string;
  target_user_id: string;
  action_type: string;
  ban_until: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  actor_email: string | null;
  target_email: string | null;
};

async function loadBanned(): Promise<{ data: BannedUser[]; error: string | null; status: number }> {
  const res = await backendFetch("/v1/admin/enforcement/banned", { method: "GET" });
  if (res.status === 403) return { data: [], error: "forbidden", status: 403 };
  if (!res.ok) {
    const msg = `Failed to load banned users (HTTP ${res.status})`;
    return { data: [], error: msg, status: res.status };
  }
  const json = (await res.json().catch(() => ({}))) as any;
  const data = (Array.isArray(json?.banned_users) ? json.banned_users : []) as BannedUser[];
  return { data, error: null, status: res.status };
}
async function loadActions(): Promise<{ data: EnforcementAction[]; error: string | null; status: number }> {
  const res = await backendFetch("/v1/admin/enforcement/actions?limit=50", { method: "GET" });
  if (res.status === 403) return { data: [], error: "forbidden", status: 403 };
  if (!res.ok) {
    const msg = `Failed to load enforcement actions (HTTP ${res.status})`;
    return { data: [], error: msg, status: res.status };
  }
  const json = (await res.json().catch(() => ({}))) as any;
  const data = (Array.isArray(json?.actions) ? json.actions : []) as EnforcementAction[];
  return { data, error: null, status: res.status };
}
export default async function Page() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const bannedRes = await loadBanned();
  const actionsRes = await loadActions();
  if (bannedRes.status === 403 || actionsRes.status === 403) redirect("/403");
  const banned = bannedRes.data;
  const actions = actionsRes.data;
  const loadError = bannedRes.error || actionsRes.error;

  async function unban(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") || "");
    const res = await backendFetch(`/v1/admin/users/${encodeURIComponent(userId)}/unban`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as any;
    const jar = await cookies();
    if (!res.ok) {
      jar.set(FLASH_COOKIE, JSON.stringify({ kind: "error", message: String(json?.message || "Failed") }), { httpOnly: true, sameSite: "lax", path: "/admin/enforcement", maxAge: 30 });
      redirect("/admin/enforcement");
    }
    revalidatePath("/admin/enforcement");
    jar.set(FLASH_COOKIE, JSON.stringify({ kind: "ok", message: "Saved." }), { httpOnly: true, sameSite: "lax", path: "/admin/enforcement", maxAge: 30 });
    redirect("/admin/enforcement");
  }
  const jar = await cookies();
  const rawFlash = jar.get(FLASH_COOKIE)?.value || "";
  let flash: { kind: "ok" | "error"; message: string } | null = null;
  if (rawFlash) {
    try { flash = JSON.parse(rawFlash); } catch { flash = null; }
    jar.set(FLASH_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/admin/enforcement", maxAge: 0 });
  }

  return (
    <div className="adminGrid">
      <header className="flex justify-between gap-3 flex-wrap items-baseline">
        <div>
          <h1 className="m-0">Strike / ban management</h1>
          <p className="muted mt-1.5 mb-0">
            Monitor active bans and strike activity, and audit recent enforcement actions.
            Unbanning restores access immediately; strike counts can be used to decide future actions.
          </p>
        </div>
        <Link prefetch={false} className="btn" href="/admin/users">Open user management</Link>
      </header>

      {loadError ? (
        <div className="adminCard border-warning bg-warning-tint">
          <strong>Some enforcement data could not be loaded.</strong>
          <div className="mt-1.5">{loadError}</div>
        </div>
      ) : null}

      {flash?.kind === "ok" ? (
        <div className="adminCard border-success bg-success-tint">
          <strong>Saved.</strong>
        </div>
      ) : null}
      {flash?.kind === "error" ? (
        <div className="adminCard border-danger bg-danger-tint">
          <strong>Couldn&apos;t complete that action.</strong>
          <div className="mt-1.5">{flash.message}</div>
        </div>
      ) : null}

      <div className="adminCard">
        <div className="font-black">Active bans</div>
        <div className="muted text-xs mt-1">{banned.length} currently banned</div>
        <table className="table mt-2.5">
          <thead>
            <tr>
              <th>User</th>
              <th>Until</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {banned.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="font-black">{u.display_name || u.email}</div>
                  <div className="muted text-xs">{u.email} · strikes {u.strike_count}</div>
                </td>
                <td className="muted text-xs">{new Date(u.banned_until).toLocaleString()}</td>
                <td className="muted text-xs">{u.banned_reason || "—"}</td>
                <td>
                  <form action={unban}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <button className="btn btnSoft" type="submit">Unban</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adminCard">
        <div className="font-black">Recent enforcement actions</div>
        <div className="muted text-xs mt-1">Last 50 actions</div>
        <table className="table mt-2.5">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Target</th>
              <th>Actor</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id}>
                <td className="muted text-xs">{new Date(a.created_at).toLocaleString()}</td>
                <td className="font-black">{a.action_type}{a.ban_until ? ` (until ${new Date(a.ban_until).toLocaleDateString()})` : ""}</td>
                <td className="muted text-xs">{a.target_email || a.target_user_id}</td>
                <td className="muted text-xs">{a.actor_email || "—"}</td>
                <td className="muted text-xs">{a.reason || a.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
