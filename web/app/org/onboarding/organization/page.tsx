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
    const slugRes = await backendFetch(`/v1/org/${encodeURIComponent(currentSlug)}/slug`, {
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

  const res = await backendFetch("/v1/org/profile", {
    method: "POST",
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

  const res = await backendFetch("/v1/org/onboarding/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ org_slug: String(ctx.org.slug || "") }),
    cache: "no-store"
  });

  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    flashRedirect("/org/onboarding/organization", "error", safeMessage(err, "Failed to finish onboarding"));
  }

  redirect("/org/dashboard");
}

export default async function Page({ searchParams }: { searchParams?: FlashSearchParams | Promise<FlashSearchParams> }) {
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
    <div style={{ maxWidth: 820, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Organization onboarding</h1>
      <p style={{ marginTop: 0, color: "#666" }}>Complete the required steps to start requesting as your organization.</p>

      {onboardingDone ? (
        <div style={{ background: "#eef", border: "1px solid #bbf", padding: "0.75rem", borderRadius: 10, margin: "0.75rem 0" }}>
          <strong>Onboarding is complete.</strong> You can edit the organization profile anytime. Changes take effect immediately.
          <div style={{ marginTop: 8 }}>
            <Link
              href="/org/dashboard"
              style={{
                display: "inline-block",
                padding: "0.5rem 0.75rem",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                textDecoration: "none"
              }}
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}

      {!onboardingDone && !adminComplete ? (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", padding: "0.75rem", borderRadius: 10, margin: "0.75rem 0" }}>
          Admin profile is incomplete. Please complete Step 1 before finishing onboarding.
        </div>
      ) : null}

      {flash?.kind === "error" ? (
        <div style={{ background: "#fee", border: "1px solid #fbb", padding: "0.75rem", borderRadius: 8, margin: "0.75rem 0" }}>
          {flash.message}
        </div>
      ) : null}

      {flash?.kind === "saved" ? (
        <div style={{ background: "#eef", border: "1px solid #bbf", padding: "0.75rem", borderRadius: 8, margin: "0.75rem 0" }}>
          {flash.message}
        </div>
      ) : null}

      {/* Step tabs (no query strings) */}
      <div style={{ display: "flex", gap: 12, margin: "1rem 0" }}>
        <Link
          href="/org/onboarding/admin"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: "#fff",
            color: "#111",
            textDecoration: "none"
          }}
        >
          1. Admin profile
        </Link>

        <Link
          href="/org/onboarding/organization"
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: "#111",
            color: "#fff",
            textDecoration: "none"
          }}
        >
          2. Organization profile
        </Link>
      </div>

      {/* Step 2: Organization profile */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Organization profile</h2>
          <Link href="/org/onboarding/admin" style={{ color: "#111", textDecoration: "underline", fontSize: 13 }}>
            Back to admin profile
          </Link>
        </div>

        <form action={saveOrgProfileAction}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Organization slug (editable)</div>
              <input
                name="slug"
                defaultValue={ctx.org.slug || ""}
                required
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>

            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Contact email (required)</div>
              <input
                name="contact_email"
                type="email"
                defaultValue={ctx.org.contact_email || ""}
                required
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Organization name</div>
              <input
                name="name"
                defaultValue={ctx.org.name || ""}
                required
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>

            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Location</div>
              <input
                name="location"
                defaultValue={ctx.org.location || ""}
                required
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Summary</div>
            <textarea
              name="summary"
              defaultValue={ctx.org.summary || ""}
              required
              rows={6}
              style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Website URL (optional)</div>
              <input
                name="website_url"
                defaultValue={ctx.org.website_url || ""}
                placeholder="https://example.org"
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>

            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Logo URL (optional)</div>
              <input
                name="logo_url"
                defaultValue={ctx.org.logo_url || ""}
                placeholder="https://..."
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Mission (optional)</div>
            <input
              name="mission"
              defaultValue={ctx.org.mission || ""}
              style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
            />
          </label>

          <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
            <button
              type="submit"
              style={{
                padding: "0.65rem 1rem",
                borderRadius: 10,
                border: 0,
                background: "#111",
                color: "#fff",
                cursor: "pointer"
              }}
            >
              Save organization profile
            </button>
          </div>
        </form>

        <hr style={{ border: 0, borderTop: "1px solid #eee", margin: "1rem 0" }} />

        {!onboardingDone ? (
<form action={finishOrgOnboardingAction}>
          <button
            type="submit"
            style={{
              padding: "0.65rem 1rem",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              color: "#111",
              cursor: "pointer"
            }}
          >
            Finish onboarding
          </button>
          <p style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
            Finishing onboarding is blocked until required fields are present (including admin name + phone).
          </p>
        </form>
) : null}
      </div>
    </div>
  );
}


