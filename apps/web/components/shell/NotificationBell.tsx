import { getCurrentUser } from "../../app/lib/backend";
import NotificationMenu from "./NotificationMenu";

/** Bell with the unread count (from the cached /v1/me, so no extra call); opens the notification menu. */
export default async function NotificationBell() {
  const n = Number((await getCurrentUser())?.unread_notifications ?? 0);
  return <NotificationMenu initialUnread={n} />;
}
