import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { Button, EmptyState, Notice, PageHeader, StatusPill } from "../../../components/ui";

export const dynamic = "force-dynamic";

type OrgApplication = {
  application_id: string;
  status: string;
  message: string | null;
  created_at: string;
  request_id: string;
  request_title: string;
  volunteer_user_id: string;
  volunteer_display_name: string | null;
  volunteer_public_location?: string | null;
};

const FILTERS = [
  { value: "pending", label: "To review" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "accepted", label: "Accepted" },
  { value: "all", label: "All" }
];

async function load(): Promise<OrgApplication[] | null> {
  const res = await backendFetch("/v1/org/applications", { method: "GET" });
  if (!res.ok) return null;
  const data = await res.json();
  return (data?.applications || []) as OrgApplication[];
}

async function setStatus(id: string, status: string, back: string) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  const res = await backendFetch(`/v1/org/applications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!res.ok) redirect(`/org/applications?status=${back}&error=${encodeURIComponent("That update didn't go through. Try again.")}`);
  redirect(`/org/applications?status=${back}`);
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default async function Page(props: { searchParams?: Promise<{ error?: string; status?: string }> }) {
  const sp = (await props.searchParams) || {};
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/org/applications");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const filter = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "pending";
  const rows = await load();
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, (rows || []).filter((r) => f.value === "all" || r.status === f.value).length]));
  const shown = (rows || []).filter((r) => filter === "all" || r.status === filter);

  return (
    <>
      <PageHeader title="Applicants" description="Review people who applied to your requests. Contact details are shared only after you accept." />
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      {rows === null ? <Notice tone="danger">Applicants couldn&apos;t load. Refresh to try again.</Notice> : null}

      <nav aria-label="Filter applicants" className="mb-6 border-b border-line">
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0">
          {FILTERS.map((f) => (
            <li key={f.value}>
              <Link
                href={`/org/applications?status=${f.value}`}
                aria-current={filter === f.value ? "page" : undefined}
                className={`-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${filter === f.value ? "border-sun text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {f.label} <span className="text-muted">({counts[f.value]})</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rows && shown.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "You're all caught up" : "Nothing here"}
          body={filter === "pending" ? "New applicants will appear here." : "No applicants in this list."}
        />
      ) : null}

      {shown.length ? (
        <ul className="m-0 border-t border-line p-0">
          {shown.map((a) => {
            const open = a.status === "pending" || a.status === "waitlisted";
            return (
              <li key={a.application_id} className="list-none border-b border-line py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 font-semibold">{a.volunteer_display_name || "Volunteer"}</p>
                    <p className="m-0 mt-0.5 text-sm text-muted">
                      <Link href={`/org/requests/${a.request_id}/applications`} className="text-muted underline">
                        {a.request_title}
                      </Link>{" "}
                      · applied {day(a.created_at)}
                      {a.volunteer_public_location ? ` · ${a.volunteer_public_location}` : ""}
                    </p>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                {a.message ? <p className="m-0 mt-2 max-w-[70ch] whitespace-pre-line text-[0.95rem]">{a.message}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {open ? (
                    <>
                      <form action={setStatus.bind(null, a.application_id, "accepted", filter)}>
                        <Button type="submit" size="sm">Accept</Button>
                      </form>
                      <form action={setStatus.bind(null, a.application_id, a.status === "pending" ? "waitlisted" : "pending", filter)}>
                        <Button type="submit" size="sm" variant="secondary">
                          {a.status === "pending" ? "Waitlist" : "Move to review"}
                        </Button>
                      </form>
                      <form action={setStatus.bind(null, a.application_id, "rejected", filter)}>
                        <Button type="submit" size="sm" variant="ghost">Decline</Button>
                      </form>
                    </>
                  ) : null}
                  <Link
                    className="ml-1 text-sm font-medium text-primary"
                    href={`/org/messages/${a.volunteer_user_id}?requestId=${a.request_id}&applicationId=${a.application_id}`}
                  >
                    Message
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}
