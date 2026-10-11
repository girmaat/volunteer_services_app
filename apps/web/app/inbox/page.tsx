import { backendFetch } from "../lib/backend";
import { Notice, PageHeader } from "../../components/ui";
import ConversationList from "../../components/inbox/ConversationList";
import LiveRefresh from "../../components/inbox/LiveRefresh";
import type { ConversationListItem } from "../../lib/inbox/types";

export const dynamic = "force-dynamic";

const SCOPES = [
  { value: "", label: "This role" },
  { value: "all", label: "All" }
];

export default async function InboxPage(props: { searchParams?: Promise<{ as?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const scope = sp.as === "all" ? "all" : "";
  const r = await backendFetch(`/v1/inbox/conversations${scope ? "?as=all" : ""}`);
  const data = r.ok ? ((await r.json()) as { conversations: ConversationListItem[] }) : null;
  return (
    <>
      <PageHeader title="Inbox" description="Conversations about your requests and applications." />
      <LiveRefresh />
      {sp.error ? (
        <div className="mb-4">
          <Notice tone="danger">{sp.error}</Notice>
        </div>
      ) : null}
      <nav aria-label="Which conversations" className="mb-4 flex gap-2">
        {SCOPES.map((s) => (
          <a
            key={s.value}
            href={s.value ? `/inbox?as=${s.value}` : "/inbox"}
            aria-current={scope === s.value ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm no-underline ${scope === s.value ? "border-primary bg-primary-tint text-primary" : "border-line text-muted"}`}
          >
            {s.label}
          </a>
        ))}
      </nav>
      {data ? <ConversationList items={data.conversations} /> : <Notice tone="danger">Your inbox couldn&apos;t load. Refresh to try again.</Notice>}
    </>
  );
}
