import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { ButtonLink, PageHeader, StatStrip, StatusPill } from "../../../components/ui";

export const dynamic = "force-dynamic";

type RequesterDashboardCounts = {
  activeRequests: number;
  pendingApplications: number;
  upcoming: number;
  unreadThreads: number;
};

type RecentApplication = {
  application_id: string;
  request_id: string;
  request_title: string;
  status: string;
  message: string | null;
  created_at: string;
  volunteer_user_id: string;
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
};

type RecentThread = {
  peer_id: string;
  request_id: string | null;
  application_id: string | null;
  request_title: string | null;
  peer_display_name: string | null;
  peer_avatar_url: string | null;
  peer_public_location: string | null;
  last_body: string;
  last_at: string;
  unread_count: number;
};

type RequesterActivity = {
  recentApplications: RecentApplication[];
  recentThreads: RecentThread[];
};

type ReputationSummary = {
  received: { average_rating: number; count: number };
  given: { count: number };
};

async function getActivity(): Promise<RequesterActivity> {
  const res = await backendFetch("/v1/requester/activity", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load requester activity");
  }
  return (await res.json()) as RequesterActivity;
}

async function getCounts(): Promise<RequesterDashboardCounts> {
  const res = await backendFetch("/v1/requester/dashboard", { method: "GET" });
  if (!res.ok) {
    throw new Error("Failed to load requester dashboard counts");
  }
  return (await res.json()) as RequesterDashboardCounts;
}

async function getReputationSummary(): Promise<ReputationSummary | null> {
  const res = await backendFetch("/v1/requester/reputation/summary", { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as ReputationSummary;
}

function threadHref(t: RecentThread) {
  return t.request_id ? `/inbox/start?requestId=${t.request_id}&volunteerId=${t.peer_id}` : "/inbox";
}

function relTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function Page() {
  const user = await getCurrentUser();
  const [counts, activity, rep] = await Promise.all([getCounts(), getActivity(), getReputationSummary()]);
  const recentApps = activity?.recentApplications || [];
  const recentThreads = activity?.recentThreads || [];
  const name = user?.email?.split("@")[0] ?? "there";

  return (
    <>
      <PageHeader
        title={`Hi, ${name}`}
        description="Your requests and the people offering to help."
        actions={
          <>
            <ButtonLink href="/requester/requests/new">Ask for help</ButtonLink>
            <ButtonLink href="/inbox" variant="secondary">
              Inbox
            </ButtonLink>
          </>
        }
      />

      <StatStrip
        stats={[
          { label: "Open requests", value: counts.activeRequests, href: "/requester/requests" },
          { label: "Applicants to review", value: counts.pendingApplications, href: "/requester/applications", attention: counts.pendingApplications > 0 },
          { label: "Upcoming", value: counts.upcoming, href: "/requester/requests", hint: "scheduled visits" },
          { label: "Unread conversations", value: counts.unreadThreads, href: "/inbox", attention: counts.unreadThreads > 0 },
          ...(rep ? [{ label: "Your rating", value: rep.received.count ? `${rep.received.average_rating.toFixed(1)} ★` : "—", href: "/requester/reputation", hint: `${rep.received.count} reviews` }] : [])
        ]}
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="new-apps">
          <div className="flex items-baseline justify-between">
            <h2 id="new-apps" className="m-0 text-lg">
              New applicants
            </h2>
            <Link href="/requester/applications" className="text-sm font-medium text-primary">
              All applicants
            </Link>
          </div>
          {recentApps.length === 0 ? (
            <p className="text-muted">No one has applied yet. Applicants appear here as soon as they do.</p>
          ) : (
            <ul className="m-0 mt-2 border-t border-line p-0">
              {recentApps.map((a) => (
                <li key={a.application_id} className="list-none border-b border-line">
                  <Link href={`/requester/requests/${a.request_id}/applications`} className="block px-1 py-3.5 text-ink no-underline hover:text-ink">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{a.volunteer_display_name || "Volunteer"}</span>
                      <StatusPill status={a.status} />
                    </div>
                    <p className="m-0 mt-0.5 text-sm text-muted">
                      {a.request_title || "Request"} · {relTime(a.created_at)}
                    </p>
                    {a.message ? <p className="m-0 mt-1 line-clamp-2 text-sm">{a.message}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="recent-msgs">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-msgs" className="m-0 text-lg">
              Recent messages
            </h2>
            <Link href="/inbox" className="text-sm font-medium text-primary">
              Open inbox
            </Link>
          </div>
          {recentThreads.length === 0 ? (
            <p className="text-muted">No conversations yet.</p>
          ) : (
            <ul className="m-0 mt-2 border-t border-line p-0">
              {recentThreads.map((t) => (
                <li key={`${t.peer_id}-${t.request_id || "none"}`} className="list-none border-b border-line">
                  <Link href={threadHref(t)} className="block px-1 py-3.5 text-ink no-underline hover:text-ink">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{t.peer_display_name || "Member"}</span>
                      <span className="text-xs text-muted">{relTime(t.last_at)}</span>
                    </div>
                    {t.request_title ? <p className="m-0 mt-0.5 text-sm text-muted">{t.request_title}</p> : null}
                    <p className="m-0 mt-1 line-clamp-1 text-sm">
                      {t.unread_count > 0 ? <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sun" aria-label="unread" /> : null}
                      {t.last_body}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside aria-label="Volunteer too" className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface px-5 py-4">
        <p className="m-0">
          <span className="font-medium">Want to help others too?</span> <span className="text-muted">Browse what your neighbors need.</span>
        </p>
        <ButtonLink href="/opportunities" variant="secondary">
          Browse opportunities
        </ButtonLink>
      </aside>
    </>
  );
}
