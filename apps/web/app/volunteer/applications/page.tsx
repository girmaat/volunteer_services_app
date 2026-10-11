import Link from "next/link";
import { backendFetch } from "../../lib/backend";
import { ButtonLink, EmptyState, Notice, PageHeader, StatusPill } from "../../../components/ui";

export const dynamic = "force-dynamic";

type ApplicationRow = {
  id: string;
  opportunity_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  title: string;
  summary: string;
  location: string;
  mode: "in-person" | "remote" | "hybrid";
  organization_name: string | null;
};

const MODE: Record<string, string> = { "in-person": "In person", remote: "Remote", hybrid: "Hybrid" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function VolunteerApplicationsPage() {
  const res = await backendFetch("/v1/volunteer/applications", { method: "GET" });
  const applications = res.ok ? ((await res.json()) as ApplicationRow[]) : null;
  const active = (applications || []).filter((a) => ["pending", "waitlisted", "accepted"].includes(a.status));
  const past = (applications || []).filter((a) => !["pending", "waitlisted", "accepted"].includes(a.status));

  const list = (rows: ApplicationRow[]) => (
    <ul className="m-0 border-t border-line p-0">
      {rows.map((a) => (
        <li key={a.id} className="list-none border-b border-line">
          <Link prefetch={false} href={`/volunteer/applications/${a.id}`} className="block px-1 py-4 text-ink no-underline hover:text-ink">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold">{a.title}</span>
              <StatusPill status={a.status} />
            </div>
            <p className="m-0 mt-0.5 text-sm text-muted">
              {a.organization_name || "Individual requester"} · {MODE[a.mode] || a.mode}
              {a.location ? ` · ${a.location}` : ""} · updated {day(a.updated_at)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader title="My applications" description="Track where you've applied. Addresses and contact details appear once you're accepted." />
      {applications === null ? <Notice tone="danger">Applications couldn&apos;t load. Refresh to try again.</Notice> : null}
      {applications && applications.length === 0 ? (
        <EmptyState title="No applications yet" body="Find something that fits your skills and schedule." action={<ButtonLink href="/volunteer/opportunities/recommended">Find opportunities</ButtonLink>} />
      ) : null}
      {active.length ? (
        <section aria-labelledby="apps-active">
          <h2 id="apps-active" className="m-0 mb-2 text-lg">Active</h2>
          {list(active)}
        </section>
      ) : null}
      {past.length ? (
        <section aria-labelledby="apps-past" className="mt-10">
          <h2 id="apps-past" className="m-0 mb-2 text-lg">Past</h2>
          {list(past)}
        </section>
      ) : null}
    </>
  );
}
