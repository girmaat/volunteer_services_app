import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import SharedProfileView, { type SharedProfile } from "../../../components/profile/SharedProfileView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Volunteer record", robots: { index: false, follow: false } };

/** A volunteer's profile, opened from the share link they created. Revoked links show "not found". */
export default async function SharedProfilePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/public/profile-shares/${encodeURIComponent(token)}`, { cache: "no-store", signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!r || !r.ok) {
    return (
      <div className="mx-auto grid max-w-xl gap-3 py-16 text-center">
        <h1 className="m-0 text-2xl">This link isn&apos;t active</h1>
        <p className="m-0 text-muted">The volunteer may have turned it off or replaced it with a new one. Ask them for a fresh link.</p>
        <p className="m-0">
          <Link prefetch={false} href="/" className="font-medium text-primary underline">
            Go to ThankYou
          </Link>
        </p>
      </div>
    );
  }
  const p = (await r.json()) as SharedProfile;
  return (
    <div className="mx-auto max-w-4xl py-4">
      <SharedProfileView p={p} />
    </div>
  );
}
