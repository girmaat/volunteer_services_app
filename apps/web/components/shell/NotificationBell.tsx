import Link from "next/link";
import { Bell } from "lucide-react";
import { backendFetch } from "../../app/lib/backend";

/** Bell with the unread count; links to the notification list. */
export default async function NotificationBell() {
  const r = await backendFetch("/v1/notifications/unread-count").catch(() => null);
  const n = r && r.ok ? Number(((await r.json()) as { unread_count?: number }).unread_count ?? 0) : 0;
  return (
    <Link
      href="/settings/notifications#recent"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded text-muted hover:bg-[var(--muted-bg)] hover:text-ink"
      aria-label={n ? `Notifications, ${n} unread` : "Notifications"}
    >
      <Bell aria-hidden className="h-5 w-5" />
      {n ? (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-[18px] text-primary-ink">
          {n > 99 ? "99+" : n}
        </span>
      ) : null}
    </Link>
  );
}
