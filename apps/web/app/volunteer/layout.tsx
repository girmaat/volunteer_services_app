import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../lib/backend";
import AppShell from "../../components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function VolunteerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/volunteer/dashboard");
  if (!user.onboarding_completed) redirect("/onboarding");
  if (user.role !== "volunteer") redirect("/dashboard");

  return (
    <AppShell user={user} context="volunteer">
      {children}
    </AppShell>
  );
}
