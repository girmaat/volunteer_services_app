import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import { getOrgContext } from "../lib/org";
import AppShell from "../../components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function RequesterLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/requester/dashboard");
  if (!user.onboarding_completed) redirect("/onboarding");
  if (user.role !== "requester") redirect("/dashboard");

  // Organization accounts use the organization area.
  if (await getOrgContext()) redirect("/org/dashboard");

  return (
    <AppShell user={user} context="requester">
      {children}
    </AppShell>
  );
}
