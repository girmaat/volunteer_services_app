import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarCheck, Clock, ExternalLink, HandHeart, MapPin, MessageSquareLock, Sparkles } from "lucide-react";
import ShareButton from "../../_components/share/ShareButton";
import { getPublicOrganization, listPublicOpportunities } from "../../../lib/public-api";
import OpportunityRow from "../../../components/opportunities/OpportunityRow";
import { buttonClass } from "../../../components/ui/Button";
import { Card, EmptyState } from "../../../components/ui/Card";
import { VerifiedBadge } from "../../../components/ui/Badge";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const org = await getPublicOrganization(slug);
  if (!org) return { title: "Organization not found" };
  return {
    title: org.name,
    description: org.summary.slice(0, 160),
    alternates: { canonical: `/organizations/${org.slug}` },
    openGraph: { title: org.name, description: org.summary.slice(0, 200), type: "profile" }
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const monthYear = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null);

export default async function Page(props: Props) {
  const { slug } = await props.params;
  const [org, opps] = await Promise.all([getPublicOrganization(slug), listPublicOpportunities({ org: slug, limit: 12 })]);
  if (!org) notFound();
  const verifiedSince = org.verified ? monthYear(org.verified_at) : null;
  const skills = org.preferred_skills ?? [];

  return (
    <div className="mx-auto grid max-w-6xl gap-8 py-4">
      <Link prefetch={false} href="/organizations" className="inline-flex w-fit items-center gap-1 text-sm text-muted no-underline hover:text-primary">
        <ArrowLeft aria-hidden className="h-4 w-4" /> Organizations
      </Link>

      {/* Header band */}
      <header className="grid gap-5 rounded-xl border border-line bg-surface p-6 shadow-sm sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-8">
        {org.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logo_url} alt="" width={80} height={80} className="h-20 w-20 rounded-xl border border-line bg-surface object-contain" />
        ) : (
          <span aria-hidden className="grid h-20 w-20 place-items-center rounded-xl bg-primary font-display text-2xl font-bold text-primary-ink">
            {initials(org.name)}
          </span>
        )}
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-2xl sm:text-3xl">{org.name}</h1>
            {org.verified ? <VerifiedBadge prominent /> : null}
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="h-4 w-4" /> {org.location || "Location not listed"}
            </span>
            {verifiedSince ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarCheck aria-hidden className="h-4 w-4" /> Verified since {verifiedSince}
              </span>
            ) : null}
            {org.website_url ? (
              <a href={org.website_url} rel="noopener noreferrer nofollow" target="_blank" className="inline-flex items-center gap-1.5 font-medium text-primary underline">
                Website <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </p>
          <p className="m-0 max-w-3xl">{org.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
          <a href="#opportunities" className={buttonClass("primary")}>
            See opportunities ({org.open_requests})
          </a>
          <ShareButton target={{ type: "org", ref: org.slug, title: org.name }} label="Share" />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-8">
          {org.mission ? (
            <section aria-labelledby="mission">
              <h2 id="mission" className="m-0 text-xl">
                Our mission
              </h2>
              <p className="m-0 mt-2 whitespace-pre-line text-ink">{org.mission}</p>
            </section>
          ) : null}

          <section id="opportunities" aria-labelledby="opps" className="scroll-mt-24">
            <h2 id="opps" className="m-0 text-xl">
              Open opportunities <span className="text-muted">({org.open_requests})</span>
            </h2>
            {opps.items.length ? (
              <ul className="m-0 mt-2 p-0">
                {opps.items.map((o) => (
                  <OpportunityRow key={o.id} o={{ ...o, public_area: o.location }} href={`/opportunities/${encodeURIComponent(o.id)}`} hidePoster />
                ))}
              </ul>
            ) : (
              <div className="mt-3">
                <EmptyState
                  title="No open opportunities right now"
                  body="New shifts and projects appear here as soon as they're posted."
                  action={
                    <Link prefetch={false} href="/opportunities" className={buttonClass("secondary")}>
                      Browse other opportunities
                    </Link>
                  }
                />
              </div>
            )}
          </section>
        </div>

        <aside aria-label="At a glance" className="grid content-start gap-4">
          <Card className="grid gap-4">
            <h2 className="m-0 text-base">At a glance</h2>
            <dl className="m-0 grid gap-3 text-sm">
              <div className="flex gap-2">
                <dt className="sr-only">Open opportunities</dt>
                <HandHeart aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <dd className="m-0">
                  <span className="font-semibold">{org.open_requests}</span> open {org.open_requests === 1 ? "opportunity" : "opportunities"}
                </dd>
              </div>
              {org.service_area ? (
                <div className="flex gap-2">
                  <dt className="sr-only">Service area</dt>
                  <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <dd className="m-0">Serves {org.service_area}</dd>
                </div>
              ) : null}
              {org.hours ? (
                <div className="flex gap-2">
                  <dt className="sr-only">Hours</dt>
                  <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <dd className="m-0 whitespace-pre-line">{org.hours}</dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="sr-only">How to get in touch</dt>
                <MessageSquareLock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <dd className="m-0">
                  {org.contact === "after_acceptance"
                    ? "Contact details are shared with volunteers after they're accepted."
                    : "Volunteers talk with this organization in Volunteer Services messages."}
                </dd>
              </div>
            </dl>
          </Card>

          {skills.length ? (
            <Card className="grid gap-3">
              <h2 className="m-0 inline-flex items-center gap-2 text-base">
                <Sparkles aria-hidden className="h-4 w-4 text-primary" /> Skills they look for
              </h2>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {skills.map((s) => (
                  <li key={s} className="rounded-full bg-wash px-3 py-1 text-sm">
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {org.verified ? (
            <Card className="grid gap-2 bg-sun-tint">
              <h2 className="m-0 text-base">What “Verified” means</h2>
              <p className="m-0 text-sm">
                Volunteer Services checked this organization&apos;s registration and the person who manages it.{" "}
                <Link prefetch={false} href="/trust-safety" className="font-medium text-primary underline">
                  How we keep people safe
                </Link>
              </p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
