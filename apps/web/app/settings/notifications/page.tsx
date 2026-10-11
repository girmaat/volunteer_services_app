import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { backendFetch } from "../../lib/backend";
import { Button, Notice } from "../../../components/ui";

export const dynamic = "force-dynamic";

type Item = { id: string; type: string; title: string; body: string; href: string | null; created_at: string; read_at: string | null };
type Pref = { type: string; label: string; email: boolean; in_app: boolean };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function markAllRead() {
  "use server";
  await backendFetch("/v1/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
  revalidatePath("/settings/notifications");
  redirect("/settings/notifications");
}

async function savePreferences(fd: FormData) {
  "use server";
  const types = fd.getAll("types").map(String);
  const preferences = types.map((type) => ({ type, email: fd.get(`email:${type}`) === "on", in_app: fd.get(`app:${type}`) === "on" }));
  const r = await backendFetch("/v1/notifications/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences }) });
  redirect(`/settings/notifications?${r.ok ? "saved=1" : "error=1"}#preferences`);
}

export default async function Page(props: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const [n, p] = await Promise.all([backendFetch("/v1/notifications?limit=50"), backendFetch("/v1/notifications/preferences")]);
  const list = n.ok ? ((await n.json()) as { notifications: Item[]; unread_count: number }) : null;
  const prefs = p.ok ? ((await p.json()) as { preferences: Pref[] }).preferences : [];

  return (
    <div className="grid gap-10">
      <section id="recent" aria-labelledby="recent-h">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="recent-h" className="m-0 text-lg">
            Notifications {list?.unread_count ? <span className="text-sm font-normal text-muted">· {list.unread_count} unread</span> : null}
          </h2>
          {list?.unread_count ? (
            <form action={markAllRead}>
              <Button type="submit" size="sm" variant="secondary">
                Mark all as read
              </Button>
            </form>
          ) : null}
        </div>
        {!list ? <Notice tone="danger">Notifications couldn&apos;t load.</Notice> : null}
        {list && !list.notifications.length ? <p className="m-0 mt-3 text-muted">Nothing yet. We&apos;ll let you know when something happens.</p> : null}
        {list?.notifications.length ? (
          <ul className="m-0 mt-3 border-t border-line p-0">
            {list.notifications.map((x) => (
              <li key={x.id} className="list-none border-b border-line">
                <Link href={x.href || "#"} className="flex items-start gap-3 px-1 py-3 text-ink no-underline hover:text-ink">
                  <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${x.read_at ? "bg-transparent" : "bg-sun"}`} />
                  <span className="min-w-0">
                    <span className={x.read_at ? "" : "font-semibold"}>{x.title}</span>
                    {x.read_at ? null : <span className="sr-only"> (unread)</span>}
                    {x.body ? <span className="block text-sm text-muted">{x.body}</span> : null}
                    <span className="block text-xs text-muted">{when(x.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section id="preferences" aria-labelledby="prefs-h">
        <h2 id="prefs-h" className="m-0 text-lg">
          What we send you
        </h2>
        <p className="m-0 mt-1 text-sm text-muted">Account and security emails (sign-in links, password resets) are always sent.</p>
        {sp.saved ? (
          <div className="mt-3">
            <Notice tone="success">Preferences saved.</Notice>
          </div>
        ) : null}
        {sp.error ? (
          <div className="mt-3">
            <Notice tone="danger">Preferences couldn&apos;t be saved.</Notice>
          </div>
        ) : null}
        <form action={savePreferences} className="mt-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Notification
                </th>
                <th scope="col" className="w-20 py-2 text-center font-medium">
                  Email
                </th>
                <th scope="col" className="w-20 py-2 text-center font-medium">
                  In app
                </th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((x) => (
                <tr key={x.type} className="border-b border-line">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <input type="hidden" name="types" value={x.type} />
                    {x.label}
                  </th>
                  <td className="text-center">
                    <input type="checkbox" name={`email:${x.type}`} defaultChecked={x.email} aria-label={`Email: ${x.label}`} className="h-4 w-4 accent-[var(--primary)]" />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" name={`app:${x.type}`} defaultChecked={x.in_app} aria-label={`In app: ${x.label}`} className="h-4 w-4 accent-[var(--primary)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <Button type="submit">Save preferences</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
