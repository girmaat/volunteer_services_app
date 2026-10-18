import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { listPublicOrganizations } from "../../lib/public-api";
import { buttonClass } from "../../components/ui/Button";
import { Card, EmptyState, Notice } from "../../components/ui/Card";
import { VerifiedBadge } from "../../components/ui/Badge";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Organizations",
  description: "Nonprofits and community groups posting volunteer opportunities on Volunteer Services.",
  alternates: { canonical: "/organizations" }
};

/** Public directory: the three most recently active organizations (the full list is in the admin portal). */
export default async function Page() {
  const { items: orgs, error } = await listPublicOrganizations();

  return (
    <div className="mx-auto grid max-w-5xl gap-8 py-6">
      <header className="grid gap-2">
        <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">Organizations</p>
        <h1 className="m-0 text-3xl">Recently active organizations</h1>
        <p className="m-0 max-w-2xl text-muted">
          The community partners who posted or updated opportunities most recently. Look for the{" "}
          <span className="font-semibold text-ink">Verified</span> badge: those organizations completed our review.
        </p>
      </header>

      {error ? <Notice tone="warning">Organizations are unavailable right now. Please try again in a moment.</Notice> : null}
      {!error && orgs.length === 0 ? <EmptyState title="No organizations yet" body="Check back soon as partners join." /> : null}

      {orgs.length ? (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {orgs.map((o) => {
            const href = `/organizations/${encodeURIComponent(o.slug)}`;
            return (
              <li key={o.slug}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-tint text-primary">
                      <Building2 className="h-5 w-5" />
                    </span>
                    {o.verified ? <VerifiedBadge prominent /> : <span className="text-xs text-muted">Not yet verified</span>}
                  </div>
                  <h2 className="m-0 text-lg leading-snug">
                    <Link prefetch={false} href={href} className="text-ink no-underline hover:text-primary hover:underline">
                      {o.name}
                    </Link>
                  </h2>
                  <p className="m-0 inline-flex items-center gap-1.5 text-sm text-muted">
                    <MapPin aria-hidden className="h-4 w-4" /> {o.location || "Location not listed"}
                  </p>
                  <p className="m-0 line-clamp-3 flex-1 text-sm">{o.summary}</p>
                  <Link prefetch={false} href={href} className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-4">
                    View profile <span className="sr-only">of {o.name}</span>
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="m-0 text-sm text-muted">
        Looking for something specific?{" "}
        <Link prefetch={false} href="/opportunities" className="font-medium text-primary underline">
          Browse all opportunities
        </Link>{" "}
        and filter by what you care about. Every opportunity links to the organization behind it.
      </p>

      <Card className="grid gap-3 bg-primary-tint sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="m-0 text-lg">Represent an organization?</h2>
          <p className="m-0 mt-1 text-sm text-muted">Register your organization to post opportunities, review applicants and track volunteer hours.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link prefetch={false} className={buttonClass("primary")} href="/org/signup">
            Register your organization
          </Link>
          <Link prefetch={false} className={buttonClass("secondary")} href="/contact">
            Contact us
          </Link>
        </div>
      </Card>
    </div>
  );
}
