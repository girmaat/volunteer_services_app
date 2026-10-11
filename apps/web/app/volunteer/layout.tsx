import { hasRole } from "../../lib/access";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, syncActiveContext } from "../lib/backend";
import AppShell from "../../components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function VolunteerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/volunteer/dashboard");
  if (!user.onboarding_completed) redirect("/onboarding");
  if (!hasRole(user, "volunteer")) redirect("/dashboard");
  await syncActiveContext(user, "volunteer");

  return (
    <AppShell user={user} context="volunteer">
      {children}
    </AppShell>
  );
}
