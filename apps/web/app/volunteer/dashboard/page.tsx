import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { PageHeader, StatStrip, EmptyState, ButtonLink, Notice } from "../../../components/ui";
import OpportunityRow, { type OpportunitySummary } from "../../../components/opportunities/OpportunityRow";

export const dynamic = "force-dynamic";

type DashboardCounts = {
  recommendedOpportunities: number;
  savedOpportunities: number;
  applicationsNeedingAction: number;
  unreadMessages: number;
  upcomingCommitments: number;
  recommended?: OpportunitySummary[];
};

export default async function Page() {
  const user = await getCurrentUser();
  // One backend call: counters and top recommendations come back together (/v1/me is cached per request).
  const countsRes = await backendFetch("/v1/volunteer/dashboard");
  const counts = countsRes.ok ? ((await countsRes.json()) as DashboardCounts) : null;
  const recs = (counts?.recommended ?? []).slice(0, 4);
  const name = user?.email?.split("@")[0] ?? "there";

  return (
    <>
      <PageHeader
        title={`Hi, ${name}`}
        description="Here's what's happening with your volunteering."
        actions={<ButtonLink href="/volunteer/opportunities/recommended">Find opportunities</ButtonLink>}
      />

      {counts ? (
        <StatStrip
          stats={[
            { label: "Applications in progress", value: counts.applicationsNeedingAction, href: "/volunteer/applications" },
            { label: "Upcoming", value: counts.upcomingCommitments, href: "/volunteer/calendar", hint: "confirmed shifts" },
            { label: "Unread messages", value: counts.unreadMessages, href: "/inbox", attention: counts.unreadMessages > 0 },
            { label: "Saved", value: counts.savedOpportunities, href: "/volunteer/opportunities/saved" }
          ]}
        />
      ) : (
        <Notice tone="danger">Your dashboard numbers couldn&apos;t load. Refresh to try again.</Notice>
      )}

      <section aria-labelledby="picked" className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="picked" className="m-0 text-lg">
            Picked for you
          </h2>
          <Link href="/volunteer/opportunities/recommended" className="text-sm font-medium text-primary">
            See all {counts ? counts.recommendedOpportunities : ""}
          </Link>
        </div>
        {recs.length ? (
          <ul className="m-0 mt-2 border-t border-line p-0">
            {recs.map((o) => (
              <OpportunityRow key={o.id} o={o} href={`/volunteer/opportunities/${o.id}`} />
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No matches yet"
              body="Add skills and the causes you care about to your profile and we'll suggest opportunities."
              action={<ButtonLink href="/volunteer/profile" variant="secondary">Update your profile</ButtonLink>}
            />
          </div>
        )}
      </section>
    </>
  );
}
