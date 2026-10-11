"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { NOTIFICATION_ACTION, timeAgo, type NotificationItem } from "../../lib/notifications";

/**
 * The bell: a menu with the latest notifications (loaded when it opens), "Mark all read" and
 * "See all". Each item opens through /notifications/open/:id, which marks it read.
 */
export default function NotificationMenu({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { notifications: NotificationItem[]; unread_count: number };
      setItems(d.notifications);
      setUnread(d.unread_count);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }

  async function markAll() {
    const r = await fetch("/api/notifications/read", { method: "POST" }).catch(() => null);
    if (r?.ok) {
      setUnread(0);
      setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? xs);
    }
  }

  return (
    <Dropdown.Root onOpenChange={(open) => open && load()}>
      <Dropdown.Trigger
        className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-muted hover:bg-wash hover:text-ink"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell aria-hidden className="h-5 w-5" />
        {unread ? (
          <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-[18px] text-primary-ink">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} collisionPadding={12} className="z-50 outline-none w-[min(92vw,380px)] rounded-md border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <Dropdown.Label className="text-sm font-semibold text-ink">Notifications</Dropdown.Label>
            {unread ? (
              <button type="button" onClick={markAll} className="inline-flex cursor-pointer items-center gap-1 rounded border-0 bg-transparent px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary-tint">
                <CheckCheck aria-hidden className="h-3.5 w-3.5" /> Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null && !failed ? <p className="m-0 px-4 py-6 text-center text-sm text-muted">Loading…</p> : null}
            {failed ? <p className="m-0 px-4 py-6 text-center text-sm text-muted">Couldn’t load notifications.</p> : null}
            {items && !items.length ? <p className="m-0 px-4 py-6 text-center text-sm text-muted">Nothing yet. We’ll let you know when something happens.</p> : null}
            {items?.map((n) => (
              <Dropdown.Item key={n.id} asChild>
                <a
                  href={`/notifications/open/${n.id}`}
                  className="flex gap-3 border-b border-line px-4 py-3 text-ink no-underline outline-none last:border-b-0 hover:bg-wash data-[highlighted]:bg-wash"
                >
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-sun"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                    {n.read_at ? null : <span className="sr-only"> (unread)</span>}
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{timeAgo(n.created_at)}</span>
                      <span className="font-medium text-primary">{NOTIFICATION_ACTION[n.type] ?? "Open"} →</span>
                    </span>
                  </span>
                </a>
              </Dropdown.Item>
            ))}
          </div>
          <div className="border-t border-line px-4 py-2.5 text-center">
            <Dropdown.Item asChild>
              <a href="/notifications" className="text-sm font-medium text-primary outline-none data-[highlighted]:underline">
                See all notifications
              </a>
            </Dropdown.Item>
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
