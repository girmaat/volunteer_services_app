import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import { getOrgContext } from "../lib/org";
import AppShell from "../../components/shell/AppShell";
import { defaultContext } from "../../components/shell/nav";

export const dynamic = "force-dynamic";

export default async function NotificationsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/notifications");
  if (!user.onboarding_completed) redirect("/onboarding");
  const ctx = defaultContext(user);
  const org = ctx === "org" ? await getOrgContext() : null;
  return (
    <AppShell user={user} context={ctx} orgName={org?.org.name}>
      {children}
    </AppShell>
  );
}
