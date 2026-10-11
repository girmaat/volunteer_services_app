import Link from "next/link";
import { cn } from "../../lib/cn";
import { Avatar } from "../ui/Controls";
import type { ConversationListItem } from "../../lib/inbox/types";

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function ConversationList({ items, activeId }: { items: ConversationListItem[]; activeId?: string }) {
  if (!items.length) return <p className="m-0 px-1 py-6 text-sm text-muted">No conversations yet. They start when someone applies to a request.</p>;
  return (
    <ul className="m-0 border-t border-line p-0">
      {items.map((c) => (
        <li key={c.id} className="list-none border-b border-line">
          <Link
            href={`/inbox/${c.id}`}
            aria-current={c.id === activeId ? "page" : undefined}
            className={cn("flex gap-3 px-3 py-3 text-ink no-underline hover:bg-[var(--muted-bg)] hover:text-ink", c.id === activeId && "bg-primary-tint")}
          >
            <Avatar name={c.with_name || "?"} src={c.with_avatar_url} size={36} className="mt-0.5" />
            <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate", c.unread ? "font-semibold" : "font-medium")}>{c.with_name}</span>
              <span className="shrink-0 text-xs text-muted">{when(c.last_message_at)}</span>
            </div>
            <p className="m-0 truncate text-xs text-muted">{c.request_title || "Direct message"}</p>
            <p className="m-0 mt-0.5 flex items-center gap-2 text-sm text-muted">
              <span className="truncate">{c.last_body || "No messages yet"}</span>
              {c.unread ? (
                <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-ink">
                  {c.unread}
                  <span className="sr-only"> unread</span>
                </span>
              ) : null}
              {c.status !== "active" ? <span className="ml-auto shrink-0 text-xs">{c.status === "ended" ? "Ended" : "Archived"}</span> : null}
            </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
