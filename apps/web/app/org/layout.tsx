import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "../lib/backend";
import { getOrgContext } from "../lib/org";
import AppShell from "../../components/shell/AppShell";
import MarketingHeader from "../../components/shell/MarketingHeader";

export const dynamic = "force-dynamic";

export default async function OrgLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  // Public org routes (e.g., /org/signup) should be reachable while logged out.
  if (!user) {
    return (
      <>
        <MarketingHeader />
        <main id="main" className="mx-auto max-w-content px-5 py-8">
          {children}
        </main>
      </>
    );
  }

  // For any logged-in user, attempt to load org context.
  // If present, render the org shell; otherwise, allow public org pages to render.
  const orgCtx = await getOrgContext();
  if (!orgCtx) {
    return (
      <>
        <MarketingHeader />
        <main id="main" className="mx-auto max-w-content px-5 py-8">
          {children}
        </main>
      </>
    );
  }

  const verificationStatus = String((orgCtx as any)?.org?.verification_status || "");
  const verificationRequired = Boolean((orgCtx as any)?.org?.verification_required);

  const verificationLabel =
    verificationStatus === "approved" || verificationStatus === "verified"
      ? "Verified"
      : verificationRequired
        ? "Verification required"
        : verificationStatus
          ? verificationStatus
          : "Unverified";

  const needsVerification = verificationRequired && verificationStatus !== "approved" && verificationStatus !== "verified";
  const banner = needsVerification ? (
    <div className="border-b border-line bg-warning-tint px-4 py-3 text-sm sm:px-6 lg:px-10" role="note">
      <strong>Verification required.</strong> Submit your organization&apos;s details in{" "}
      <Link className="font-medium text-primary underline" href="/org/settings#verification">
        Organization settings
      </Link>
      . A platform admin reviews them before your requests are marked verified.
    </div>
  ) : null;

  return (
    <AppShell user={user} context="org" orgName={orgCtx.org.name} banner={banner}>
      <p className="m-0 mb-4 text-sm text-muted">
        {orgCtx.org.name} · {orgCtx.membership.role === "admin" ? "Admin" : orgCtx.membership.role === "manager" ? "Manager" : "Member"} · {verificationLabel}
      </p>
      {children}
    </AppShell>
  );
}