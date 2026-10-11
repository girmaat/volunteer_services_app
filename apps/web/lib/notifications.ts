/** Shared by the bell menu and the notifications page. */
export type NotificationItem = { id: string; type: string; title: string; body: string; href: string | null; created_at: string; read_at: string | null };

/** The one thing to do next for each kind of notification. */
export const NOTIFICATION_ACTION: Record<string, string> = {
  application_received: "Review applicant",
  application_status: "View application",
  attendance_reminder: "Confirm you’re coming",
  message_received: "Reply",
  review_requested: "Leave a review",
  request_updates: "View request",
  moderation: "Open queue",
  disputes: "View dispute"
};

/** Only same-site paths are followed from a notification. */
export function safeHref(href: string | null | undefined) {
  const h = String(href || "");
  return h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/\\") ? h : "/notifications";
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
