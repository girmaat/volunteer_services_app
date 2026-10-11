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
    <div style={{ maxWidth: 820, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Onboarding complete</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        You can review and update the admin + organization profiles anytime. Changes take effect immediately.
      </p>

      <div style={{ background: "#eef", border: "1px solid #bbf", padding: "0.75rem", borderRadius: 10, margin: "0.75rem 0" }}>
        <div style={{ fontWeight: 600 }}>Organization: {orgName}</div>
        <div style={{ fontSize: 12, color: "#555" }}>Slug: {orgSlug || "—"}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <Link
          href="/org/onboarding/admin"
          style={{
            display: "block",
            padding: "1rem",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111",
            textDecoration: "none"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Admin profile</div>
          <div style={{ color: "#666", fontSize: 13 }}>Update admin name + phone used for org onboarding requirements.</div>
        </Link>

        <Link
          href="/org/onboarding/organization"
          style={{
            display: "block",
            padding: "1rem",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111",
            textDecoration: "none"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Organization profile</div>
          <div style={{ color: "#666", fontSize: 13 }}>Update org slug, summary, contact email, logo, and more.</div>
        </Link>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link
          href="/org/dashboard"
          style={{
            display: "inline-block",
            padding: "0.65rem 1rem",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            textDecoration: "none"
          }}
        >
          Back to org dashboard
        </Link>
      </div>
    </div>
  );
}
