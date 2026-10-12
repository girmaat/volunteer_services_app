import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCheck, Settings } from "lucide-react";
import { backendFetch } from "../lib/backend";
import { EmptyState, LinkTabs, Notice, PageHeader, SubmitButton } from "../../components/ui";
import { NOTIFICATION_ACTION, timeAgo, type NotificationItem } from "../../lib/notifications";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications", robots: { index: false } };

const PAGE = 30;

async function markAllRead() {
  "use server";
  await backendFetch("/v1/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
  redirect("/notifications");
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if (today.getTime() - d.getTime() < 7 * 86400_000) return "This week";
  return "Earlier";
}

export default async function NotificationsPage(props: { searchParams?: Promise<{ filter?: string; before?: string }> }) {
  const sp = (await props.searchParams) || {};
  const unreadOnly = sp.filter === "unread";
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : "";
  // Unread-only filtering is done here (the API lists newest first); fetch a bit more to fill the page.
  const qs = new URLSearchParams({ limit: String(unreadOnly ? 100 : PAGE + 1), ...(before ? { before } : {}) });
  const res = await backendFetch(`/v1/notifications?${qs}`);
  const data = res.ok ? ((await res.json()) as { notifications: NotificationItem[]; unread_count: number }) : null;
  const all = data?.notifications ?? [];
  const shown = (unreadOnly ? all.filter((n) => !n.read_at) : all).slice(0, PAGE);
  const older = !unreadOnly && all.length > PAGE ? shown[shown.length - 1]?.created_at : null;

  const groups: { label: string; items: NotificationItem[] }[] = [];
  for (const n of shown) {
    const label = dayLabel(n.created_at);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={data?.unread_count ? `${data.unread_count} unread` : "You’re all caught up."}
        actions={
          <>
            {data?.unread_count ? (
              <form action={markAllRead}>
                <SubmitButton variant="secondary" icon={<CheckCheck aria-hidden className="h-4 w-4" />}>
                  Mark all as read
                </SubmitButton>
              </form>
            ) : null}
            <Link prefetch={false} href="/settings/notifications" className="inline-flex h-10 items-center gap-2 rounded px-3 text-sm font-medium text-muted hover:text-ink">
              <Settings aria-hidden className="h-4 w-4" /> Email settings
            </Link>
          </>
        }
      />
      <LinkTabs
        label="Filter notifications"
        items={[
          { href: "/notifications", label: "All", active: !unreadOnly },
          { href: "/notifications?filter=unread", label: `Unread${data?.unread_count ? ` (${data.unread_count})` : ""}`, active: unreadOnly }
        ]}
      />
      {!data ? <Notice tone="danger">Notifications couldn’t load. Refresh to try again.</Notice> : null}
      {data && !shown.length ? (
        <EmptyState
          title={unreadOnly ? "Nothing unread" : "Nothing yet"}
          body={unreadOnly ? "You’ve seen everything." : "We’ll let you know when someone applies, replies, or when something needs you."}
        />
      ) : null}
      {groups.map((g) => (
        <section key={g.label} aria-labelledby={`n-${g.label}`} className="mb-8">
          <h2 id={`n-${g.label}`} className="m-0 mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {g.label}
          </h2>
          <ul className="m-0 overflow-hidden rounded-md border border-line bg-surface p-0">
            {g.items.map((n) => (
              <li key={n.id} className="list-none border-b border-line last:border-b-0">
                <a href={`/notifications/open/${n.id}`} className={`flex gap-3 px-4 py-4 text-ink no-underline hover:bg-wash`}>
                  <span aria-hidden className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${n.read_at ? "bg-line" : "bg-sun"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                    {n.read_at ? null : <span className="sr-only"> (unread)</span>}
                    {n.body ? <span className="mt-0.5 block text-sm text-muted">{n.body}</span> : null}
                    <span className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <time dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
                      <span className="text-sm font-medium text-primary">{NOTIFICATION_ACTION[n.type] ?? "Open"} →</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {older ? (
        <Link prefetch={false} href={`/notifications?before=${encodeURIComponent(older)}`} className="inline-flex h-10 items-center rounded border border-line-strong bg-surface px-4 text-sm font-medium text-ink no-underline hover:border-ink">
          Show older
        </Link>
      ) : null}
    </>
  );
}
