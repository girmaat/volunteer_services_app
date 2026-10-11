import { backendFetch, getCurrentUser } from "../lib/backend";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type OrgMeResponse = {
  org?: {
    onboarding_completed?: boolean;
  };
};

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) redirect("/login?next=/dashboard");

  const accountType = String((user as any).account_type || "");
  const requesterMode = String((user as any).requester_mode || "");

  // Organization-requester accounts establish org context via /org/signup.
  // They should never reach the generic dashboard before doing so.
  const isOrgRequester =
    user.role === "requester" && (requesterMode === "organization" || accountType === "requester_org");

  // Org team members also should not land on the generic dashboard.
  const isOrgTeamMember = user.role === "org_admin" || accountType === "org_team_member";

  if (isOrgRequester) {
    redirect("/org/signup");
  }

  if (isOrgTeamMember) {
    const res = await backendFetch("/v1/org/me", { method: "GET" });

    if (res.status === 401) redirect("/login");

    // No org context yet (or not allowed) => take them to org signup to establish org context.
    if (res.status === 403 || res.status === 404) redirect("/org/signup");

    if (res.ok) {
      const ctx = (await res.json().catch(() => null)) as OrgMeResponse | null;
      const done = Boolean(ctx?.org?.onboarding_completed);
      redirect(done ? "/org/dashboard" : "/org/onboarding");
    }

    // Any other unexpected failure: fall back to org signup to recover.
    redirect("/org/signup");
  }

  // Non-org users must complete onboarding before reaching the dashboard.
  if (!user.onboarding_completed) {
    redirect("/onboarding");
  }

  // Everyone lands in their own area.
  if (user.role === "volunteer") redirect("/volunteer/dashboard");
  if (user.role === "requester") redirect("/requester/dashboard");
  if (user.is_platform_admin) redirect("/admin");
  redirect("/settings");
}
