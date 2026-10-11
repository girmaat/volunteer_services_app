import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import { getOrgContext } from "../lib/org";
import AppShell from "../../components/shell/AppShell";
import { PageHeader } from "../../components/ui";
import { defaultContext } from "../../components/shell/nav";
import { SettingsNav } from "./SettingsNav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/settings");
  if (!user.onboarding_completed) redirect("/onboarding");
  const ctx = defaultContext(user);
  const org = ctx === "org" ? await getOrgContext() : null;

  return (
    <AppShell user={user} context={ctx} orgName={org?.org.name}>
      <PageHeader title="Settings" description="Your account, notifications, privacy and safety." />
      <SettingsNav />
      {children}
    </AppShell>
  );
}
