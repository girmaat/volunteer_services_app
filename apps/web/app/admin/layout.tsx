import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import AppShell from "../../components/shell/AppShell";
import { ButtonLink, Notice } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/admin");
  // Moderators work the queues; settings, users and admins stay with platform admins (the API enforces it).
  const moderator = user.is_platform_admin || user.platform_admin_role === "moderator";
  if (!moderator) redirect("/403");

  return (
    <AppShell user={user} context="admin">
      {user.mfa_setup_required ? (
        <div className="grid max-w-xl gap-4">
          <h1 className="m-0 text-2xl">Turn on two-step sign-in</h1>
          <Notice tone="warning">Admin tools need two-step sign-in. It takes a minute with an authenticator app on your phone.</Notice>
          <ButtonLink href="/settings/account#two-step">Set it up</ButtonLink>
        </div>
      ) : (
        children
      )}
    </AppShell>
  );
}
