import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch } from "../../lib/backend";
import { Badge, EmptyState, Notice, PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

type Row = { id: string; status: string; last_message_at: string | null; created_at: string; member_name: string | null; org_name: string | null; last_body: string | null; awaiting_reply: boolean };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Messages organizations sent to the ThankYou team (from Contact us → Message the ThankYou team). */
export default async function SupportInbox() {
  const r = await backendFetch("/v1/admin/support");
  if (r.status === 403) redirect("/403");
  const data = r.ok ? ((await r.json()) as { items: Row[] }) : null;
  return (
    <>
      <PageHeader title="Support messages" description="Organizations write to the ThankYou team from Contact us. Open a thread to reply; it lands in their Inbox." />
      {!data ? <Notice tone="danger">Support messages are unavailable right now.</Notice> : null}
      {data && !data.items.length ? <EmptyState title="No support messages yet" body="When an organization member messages the team, it shows up here." /> : null}
      {data?.items.length ? (
        <ul className="m-0 grid list-none gap-0 p-0">
          {data.items.map((x) => (
            <li key={x.id} className="border-b border-line">
              <Link prefetch={false} href={`/inbox/${x.id}`} className="grid gap-1 px-1 py-3 text-ink no-underline hover:bg-wash sm:grid-cols-[1fr_auto] sm:gap-4">
                <span className="min-w-0">
                  <span className="font-semibold">{x.member_name || "Member"}</span>
                  {x.org_name ? <span className="text-muted"> · {x.org_name}</span> : null}
                  <span className="mt-0.5 block truncate text-sm text-muted">{x.last_body || "No messages yet"}</span>
                </span>
                <span className="flex items-center gap-2 text-sm text-muted">
                  {x.awaiting_reply ? <Badge tone="warning">Needs a reply</Badge> : <Badge>Answered</Badge>}
                  {when(x.last_message_at || x.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
