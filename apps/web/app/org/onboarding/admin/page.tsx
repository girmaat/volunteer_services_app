import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch } from "../../../lib/backend";
import { flashRedirect, getAdminProfile, readFlash, requireOrgContextOrRedirect, safeMessage, type FlashSearchParams } from "../_lib";

export const dynamic = "force-dynamic";

async function saveAdminProfileAction(formData: FormData) {
  "use server";

  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!fullName || !phone) {
    flashRedirect("/org/onboarding/admin", "error", "Admin name and phone are required.");
  }

  const res = await backendFetch("/v1/onboarding/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName, phone })
  });

  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    flashRedirect("/org/onboarding/admin", "error", safeMessage(err, "Failed to save admin profile"));
  }

  flashRedirect("/org/onboarding/organization", "saved", "Admin profile saved.");
}

export default async function Page(
  props: { searchParams?: Promise<FlashSearchParams | Promise<FlashSearchParams>> }
) {
  const searchParams = await props.searchParams;
  const ctx = await requireOrgContextOrRedirect();

  const onboardingDone = Boolean(ctx?.org?.onboarding_completed);

  const adminProfile = await getAdminProfile();
  const adminComplete =
    Boolean(String(adminProfile?.full_name || "").trim()) &&
    Boolean(String(adminProfile?.phone || "").trim());

  const adminPrefillPresent =
    Boolean(String(adminProfile?.full_name || "").trim()) ||
    Boolean(String(adminProfile?.phone || "").trim());

  const flash = await readFlash(searchParams);

  return (
    <div className="max-w-[820px] my-8 mx-auto py-0 px-4">
      <h1 className="text-xl mb-1">Organization onboarding</h1>
      <p className="mt-0 text-muted">Complete the required steps to start requesting as your organization.</p>

      {onboardingDone ? (
        <div className="bg-primary-tint border border-primary p-3 rounded-md my-3 mx-0">
          <strong>Onboarding is complete.</strong> You can edit these details anytime.
          <div className="mt-2">
            <Link className="inline-block py-2 px-3 rounded-md border border-line bg-wash text-muted no-underline"
              href="/org/dashboard" 
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}

      {flash?.kind === "error" ? (
        <div className="bg-danger-tint border border-line p-3 rounded my-3 mx-0">
          {flash.message}
        </div>
      ) : null}

      {flash?.kind === "saved" ? (
        <div className="bg-primary-tint border border-primary p-3 rounded my-3 mx-0">
          {flash.message}
        </div>
      ) : null}

      {/* Step tabs (no query strings) */}
      <div className="flex gap-3 my-4 mx-0">
        <Link className="py-2 px-3 rounded-full border border-line bg-wash text-muted no-underline"
          href="/org/onboarding/admin" 
        >
          1. Admin profile
        </Link>

        <Link className="py-2 px-3 rounded-full border border-line bg-surface text-ink no-underline"
          href="/org/onboarding/organization" 
        >
          2. Organization profile
        </Link>
      </div>

      {/* Step 1: Admin profile */}
      <div className="border border-line rounded-lg p-4 mb-4">
        <h2 className="mt-0">Admin personal profile (minimal)</h2>
        <p className="mt-0 text-muted">Required so volunteers and requesters have a point of contact.</p>

        {adminPrefillPresent ? (
          <div className="mb-3 rounded-md border border-line bg-wash px-3 py-2.5 text-xs text-ink">
            Prefilled from your existing profile. Update if anything changed.
          </div>
        ) : null}

        <form action={saveAdminProfileAction}>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <div className="text-xs text-muted mb-1">Full name</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="fullName"
                defaultValue={adminProfile?.full_name || ""}
                required 
              />
            </label>

            <label>
              <div className="text-xs text-muted mb-1">Phone</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="phone"
                defaultValue={adminProfile?.phone || ""}
                required 
              />
            </label>
          </div>

          <div className="flex gap-3 mt-3 items-center">
            <button className="py-2.5 px-4 rounded-md border-0 bg-wash text-muted cursor-pointer"
              type="submit" 
            >
              Save admin profile
            </button>

            <Link
              href="/org/onboarding/organization"
              className={`rounded-md border border-ink bg-surface px-4 py-2.5 text-ink no-underline ${adminComplete ? "" : "pointer-events-none opacity-50"}`}
              aria-disabled={!adminComplete}
            >
              Continue to organization profile
            </Link>
          </div>

          {!adminComplete ? (
            <p className="mt-2.5 text-muted text-xs">
              Add your name and phone, then continue to the organization profile step.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}


