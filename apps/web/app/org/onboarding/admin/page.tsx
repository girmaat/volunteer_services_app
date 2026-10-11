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
    <div style={{ maxWidth: 820, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Organization onboarding</h1>
      <p style={{ marginTop: 0, color: "#666" }}>Complete the required steps to start requesting as your organization.</p>

      {onboardingDone ? (
        <div style={{ background: "#eef", border: "1px solid #bbf", padding: "0.75rem", borderRadius: 10, margin: "0.75rem 0" }}>
          <strong>Onboarding is complete.</strong> You can edit these details anytime.
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
            background: "#111",
            color: "#fff",
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
            background: "#fff",
            color: "#111",
            textDecoration: "none"
          }}
        >
          2. Organization profile
        </Link>
      </div>

      {/* Step 1: Admin profile */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: "1rem", marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Admin personal profile (minimal)</h2>
        <p style={{ marginTop: 0, color: "#666" }}>Required so volunteers and requesters have a point of contact.</p>

        {adminPrefillPresent ? (
          <div
            style={{
              padding: "0.6rem 0.75rem",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#f9fafb",
              color: "#111",
              fontSize: 13,
              marginBottom: 12
            }}
          >
            Prefilled from your existing profile. Update if anything changed.
          </div>
        ) : null}

        <form action={saveAdminProfileAction}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Full name</div>
              <input
                name="fullName"
                defaultValue={adminProfile?.full_name || ""}
                required
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>

            <label>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Phone</div>
              <input
                name="phone"
                defaultValue={adminProfile?.phone || ""}
                required
                style={{ width: "100%", padding: "0.6rem", border: "1px solid #ddd", borderRadius: 8 }}
              />
            </label>
          </div>

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
              Save admin profile
            </button>

            <Link
              href="/org/onboarding/organization"
              style={{
                padding: "0.65rem 1rem",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#fff",
                color: "#111",
                textDecoration: "none",
                opacity: adminComplete ? 1 : 0.5,
                pointerEvents: adminComplete ? "auto" : "none"
              }}
            >
              Continue to organization profile
            </Link>
          </div>

          {!adminComplete ? (
            <p style={{ marginTop: 10, color: "#666", fontSize: 12 }}>
              Add your name and phone, then continue to the organization profile step.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}


