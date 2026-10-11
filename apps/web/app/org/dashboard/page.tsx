import Link from "next/link";
import { backendFetch } from "../../lib/backend";
import { ButtonLink, EmptyState, Notice, PageHeader, StatStrip, StatusPill } from "../../../components/ui";

export const dynamic = "force-dynamic";

type OrgDashboard = {
  org: { name: string; onboarding_completed?: boolean };
  openRequests: number;
  pendingApplications: number;
  unreadMessages: number;
  activeMembers: number;
  recentRequests: { id: string; title: string; status: string; updated_at: string; applications_total: number; applications_pending: number }[];
  recentApplications: {
    application_id: string;
    status: string;
    updated_at: string;
    request_id: string;
    request_title: string;
    volunteer_display_name: string | null;
    volunteer_public_location: string | null;
  }[];
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function OrgDashboardPage() {
  const res = await backendFetch("/v1/org/dashboard");
  const data = res.ok ? ((await res.json()) as OrgDashboard) : null;

  return (
    <>
      <PageHeader
        title="Home"
        description="Requests, applicants and messages for your organization."
        actions={<ButtonLink href="/org/requests/new">Post a request</ButtonLink>}
      />

      {!data ? (
        <Notice tone="danger">The dashboard couldn&apos;t load. Refresh to try again.</Notice>
      ) : (
        <>
          {data.org.onboarding_completed === false ? (
            <div className="mb-6">
              <Notice tone="warning">
                Finish setting up your organization so volunteers can trust your requests.{" "}
                <Link href="/org/onboarding" className="font-medium text-primary underline">
                  Continue setup
                </Link>
              </Notice>
            </div>
          ) : null}

          <StatStrip
            stats={[
              { label: "Open requests", value: data.openRequests, href: "/org/requests" },
              { label: "Applicants to review", value: data.pendingApplications, href: "/org/applications", attention: data.pendingApplications > 0 },
              { label: "Unread messages", value: data.unreadMessages, href: "/org/messages", attention: data.unreadMessages > 0 },
              { label: "Team members", value: data.activeMembers, href: "/org/team" }
            ]}
          />

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="org-recent-apps">
              <div className="flex items-baseline justify-between">
                <h2 id="org-recent-apps" className="m-0 text-lg">
                  Latest applicants
                </h2>
                <Link href="/org/applications" className="text-sm font-medium text-primary">
                  Review all
                </Link>
              </div>
              {data.recentApplications.length === 0 ? (
                <p className="text-muted">No applicants yet.</p>
              ) : (
                <ul className="m-0 mt-2 border-t border-line p-0">
                  {data.recentApplications.map((a) => (
                    <li key={a.application_id} className="list-none border-b border-line">
                      <Link href={`/org/requests/${a.request_id}/applications`} className="block px-1 py-3.5 text-ink no-underline hover:text-ink">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{a.volunteer_display_name || "Volunteer"}</span>
                          <StatusPill status={a.status} />
                        </div>
                        <p className="m-0 mt-0.5 text-sm text-muted">
                          {a.request_title} · {a.volunteer_public_location || "Location not shared"} · {day(a.updated_at)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="org-recent-reqs">
              <div className="flex items-baseline justify-between">
                <h2 id="org-recent-reqs" className="m-0 text-lg">
                  Recent requests
                </h2>
                <Link href="/org/requests" className="text-sm font-medium text-primary">
                  All requests
                </Link>
              </div>
              {data.recentRequests.length === 0 ? (
                <div className="mt-3">
                  <EmptyState title="No requests yet" body="Post your first shift or project to start receiving applicants." action={<ButtonLink href="/org/requests/new">Post a request</ButtonLink>} />
                </div>
              ) : (
                <ul className="m-0 mt-2 border-t border-line p-0">
                  {data.recentRequests.map((r) => (
                    <li key={r.id} className="list-none border-b border-line">
                      <Link href={`/org/requests/${r.id}`} className="block px-1 py-3.5 text-ink no-underline hover:text-ink">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{r.title}</span>
                          <StatusPill status={r.status} />
                        </div>
                        <p className="m-0 mt-0.5 text-sm text-muted">
                          {r.applications_total} applicant{r.applications_total === 1 ? "" : "s"}
                          {r.applications_pending ? `, ${r.applications_pending} waiting` : ""} · updated {day(r.updated_at)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
