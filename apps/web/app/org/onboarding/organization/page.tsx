import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch } from "../../../lib/backend";
import { flashRedirect, getAdminProfile, readFlash, requireOrgContextOrRedirect, safeMessage, type FlashSearchParams } from "../_lib";

export const dynamic = "force-dynamic";

async function saveOrgProfileAction(formData: FormData) {
  "use server";

  const ctx = await requireOrgContextOrRedirect();
  const currentSlug = String(ctx.org.slug || "");

  const desiredSlug = String(formData.get("slug") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const summary = String(formData.get("summary") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const mission = String(formData.get("mission") || "").trim();
  const website_url = String(formData.get("website_url") || "").trim();
  const contact_email = String(formData.get("contact_email") || "").trim();
  const logo_url = String(formData.get("logo_url") || "").trim();

  if (!desiredSlug || !name || !summary || !location || !contact_email) {
    flashRedirect("/org/onboarding/organization", "error", "Slug, name, summary, location, and contact email are required.");
  }

  // Update slug if changed.
  if (desiredSlug !== currentSlug) {
    const slugRes = await backendFetch(`/v1/orgs/${encodeURIComponent(currentSlug)}/slug`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: desiredSlug }),
      cache: "no-store"
    });

    if (slugRes.status === 401) redirect("/login");
    if (!slugRes.ok) {
      const err = await slugRes.json().catch(() => ({}));
      flashRedirect("/org/onboarding/organization", "error", safeMessage(err, "Failed to update organization slug"));
    }
  }

  const slugNow = desiredSlug && desiredSlug !== currentSlug ? desiredSlug : currentSlug;
  const res = await backendFetch(`/v1/orgs/${encodeURIComponent(slugNow)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      summary,
      location,
      mission: mission || null,
      website_url: website_url || null,
      contact_email,
      logo_url: logo_url || null
    }),
    cache: "no-store"
  });

  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    flashRedirect("/org/onboarding/organization", "error", safeMessage(err, "Failed to save organization profile"));
  }

  flashRedirect("/org/onboarding/organization", "saved", "Organization profile saved.");
}

async function finishOrgOnboardingAction() {
  "use server";

  const ctx = await requireOrgContextOrRedirect();

  const res = await backendFetch(`/v1/orgs/${encodeURIComponent(String(ctx.org.slug || ""))}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ onboarding_completed: true }),
    cache: "no-store"
  });

  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    flashRedirect("/org/onboarding/organization", "error", safeMessage(err, "Failed to finish onboarding"));
  }

  redirect("/org/dashboard");
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

  // Guard: Step 2 requires Step 1 (during initial onboarding). After onboarding is complete, allow edits even if admin is missing.
  if (!adminComplete && !onboardingDone) {
    flashRedirect("/org/onboarding/admin", "error", "Complete the admin profile first.");
  }

  const flash = await readFlash(searchParams);

  return (
    <div className="max-w-[820px] my-8 mx-auto py-0 px-4">
      <h1 className="text-xl mb-1">Organization onboarding</h1>
      <p className="mt-0 text-muted">Complete the required steps to start requesting as your organization.</p>

      {onboardingDone ? (
        <div className="bg-primary-tint border border-primary p-3 rounded-md my-3 mx-0">
          <strong>Onboarding is complete.</strong> You can edit the organization profile anytime. Changes take effect immediately.
          <div className="mt-2">
            <Link prefetch={false} className="inline-block py-2 px-3 rounded-md border border-line bg-wash text-muted no-underline"
              href="/org/dashboard" 
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}

      {!onboardingDone && !adminComplete ? (
        <div className="bg-wash border border-warning p-3 rounded-md my-3 mx-0">
          Admin profile is incomplete. Please complete Step 1 before finishing onboarding.
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
        <Link prefetch={false} className="py-2 px-3 rounded-full border border-line bg-surface text-ink no-underline"
          href="/org/onboarding/admin" 
        >
          1. Admin profile
        </Link>

        <Link prefetch={false} className="py-2 px-3 rounded-full border border-line bg-wash text-muted no-underline"
          href="/org/onboarding/organization" 
        >
          2. Organization profile
        </Link>
      </div>

      {/* Step 2: Organization profile */}
      <div className="border border-line rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="mt-0 mb-0">Organization profile</h2>
          <Link prefetch={false} className="text-ink underline text-xs" href="/org/onboarding/admin">
            Back to admin profile
          </Link>
        </div>

        <form action={saveOrgProfileAction}>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <div className="text-xs text-muted mb-1">Organization slug (editable)</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="slug"
                defaultValue={ctx.org.slug || ""}
                required 
              />
            </label>

            <label>
              <div className="text-xs text-muted mb-1">Contact email (required)</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="contact_email"
                type="email"
                defaultValue={ctx.org.contact_email || ""}
                required 
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <label>
              <div className="text-xs text-muted mb-1">Organization name</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="name"
                defaultValue={ctx.org.name || ""}
                required 
              />
            </label>

            <label>
              <div className="text-xs text-muted mb-1">Location</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="location"
                defaultValue={ctx.org.location || ""}
                required 
              />
            </label>
          </div>

          <label className="block mt-3">
            <div className="text-xs text-muted mb-1">Summary</div>
            <textarea className="w-full p-2.5 border border-line rounded"
              name="summary"
              defaultValue={ctx.org.summary || ""}
              required
              rows={6} 
            />
          </label>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <label>
              <div className="text-xs text-muted mb-1">Website URL (optional)</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="website_url"
                defaultValue={ctx.org.website_url || ""}
                placeholder="https://example.org" 
              />
            </label>

            <label>
              <div className="text-xs text-muted mb-1">Logo URL (optional)</div>
              <input className="w-full p-2.5 border border-line rounded"
                name="logo_url"
                defaultValue={ctx.org.logo_url || ""}
                placeholder="https://..." 
              />
            </label>
          </div>

          <label className="block mt-3">
            <div className="text-xs text-muted mb-1">Mission (optional)</div>
            <input className="w-full p-2.5 border border-line rounded"
              name="mission"
              defaultValue={ctx.org.mission || ""} 
            />
          </label>

          <div className="flex gap-3 mt-3 items-center">
            <button className="py-2.5 px-4 rounded-md border-0 bg-wash text-muted cursor-pointer"
              type="submit" 
            >
              Save organization profile
            </button>
          </div>
        </form>

        <hr className="border-0 border-t border-line my-4 mx-0" />

        {!onboardingDone ? (
<form action={finishOrgOnboardingAction}>
          <button className="py-2.5 px-4 rounded-md border border-line bg-surface text-ink cursor-pointer"
            type="submit" 
          >
            Finish onboarding
          </button>
          <p className="mt-3 text-muted text-xs">
            Finishing onboarding is blocked until required fields are present (including admin name + phone).
          </p>
        </form>
) : null}
      </div>
    </div>
  );
}


