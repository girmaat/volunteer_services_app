import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import AppShell from "../../components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/admin");
  // Moderators work the queues; settings, users and admins stay with platform admins (the API enforces it).
  const moderator = user.is_platform_admin || user.platform_admin_role === "moderator";
  if (!moderator) redirect("/403");

  return (
    <AppShell user={user} context="admin">
      {children}
    </AppShell>
  );
}
