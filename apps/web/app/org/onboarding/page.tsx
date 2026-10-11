import Link from "next/link";
import { redirect } from "next/navigation";
import { flashRedirect, getAdminProfile, requireOrgContextOrRedirect } from "./_lib";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireOrgContextOrRedirect();

  const onboardingDone = Boolean(ctx?.org?.onboarding_completed);

  // For unfinished onboarding, keep the "wizard" behavior and send the user to the next required step.
  if (!onboardingDone) {
    const adminProfile = await getAdminProfile();
    const adminComplete =
      Boolean(String(adminProfile?.full_name || "").trim()) &&
      Boolean(String(adminProfile?.phone || "").trim());

    if (adminComplete) {
      redirect("/org/onboarding/organization");
    }
    flashRedirect("/org/onboarding/admin", "error", "Complete the admin profile first.");
  }

  // If onboarding is already completed, do NOT bounce users away — this route becomes the "Edit onboarding profiles" hub.
  const orgName = String(ctx?.org?.name || "Your organization");
  const orgSlug = String(ctx?.org?.slug || "");

  return (
    <div className="max-w-[820px] my-8 mx-auto py-0 px-4">
      <h1 className="text-xl mb-1">Onboarding complete</h1>
      <p className="mt-0 text-muted">
        You can review and update the admin + organization profiles anytime. Changes take effect immediately.
      </p>

      <div className="bg-primary-tint border border-primary p-3 rounded-md my-3 mx-0">
        <div className="font-semibold">Organization: {orgName}</div>
        <div className="text-xs text-muted">Slug: {orgSlug || "—"}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <Link className="block p-4 rounded-lg border border-line bg-surface text-ink no-underline"
          href="/org/onboarding/admin" 
        >
          <div className="font-bold mb-1.5">Admin profile</div>
          <div className="text-muted text-xs">Update admin name + phone used for org onboarding requirements.</div>
        </Link>

        <Link className="block p-4 rounded-lg border border-line bg-surface text-ink no-underline"
          href="/org/onboarding/organization" 
        >
          <div className="font-bold mb-1.5">Organization profile</div>
          <div className="text-muted text-xs">Update org slug, summary, contact email, logo, and more.</div>
        </Link>
      </div>

      <div className="mt-3.5">
        <Link className="inline-block py-2.5 px-4 rounded-md border border-line bg-wash text-muted no-underline"
          href="/org/dashboard" 
        >
          Back to org dashboard
        </Link>
      </div>
    </div>
  );
}
