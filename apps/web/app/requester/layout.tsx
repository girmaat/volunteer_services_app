import { hasRole } from "../../lib/access";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, syncActiveContext } from "../lib/backend";
import AppShell from "../../components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function RequesterLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/requester/dashboard");
  if (!user.onboarding_completed) redirect("/onboarding");
  if (!hasRole(user, "requester")) redirect("/dashboard");
  await syncActiveContext(user, "requester");

  return (
    <AppShell user={user} context="requester">
      {children}
    </AppShell>
  );
}
