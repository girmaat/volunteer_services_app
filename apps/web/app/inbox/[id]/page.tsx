import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, Paperclip, ShieldAlert } from "lucide-react";
import { backendFetch } from "../../lib/backend";
import { Button, Notice, StatusPill } from "../../../components/ui";
import ConversationList from "../../../components/inbox/ConversationList";
import LiveRefresh from "../../../components/inbox/LiveRefresh";
import type { ConversationListItem, ThreadConversation, ThreadMessage } from "../../../lib/inbox/types";
import { sendMessageAction, threadAction } from "../actions";
import { cn } from "../../../lib/cn";

export const dynamic = "force-dynamic";

const FLASH: Record<string, string> = {
  reported: "Thanks — our team will review this conversation. You can also block them.",
  block: "Blocked. Neither of you can message the other, and the conversation is closed.",
  end: "Conversation ended. It stays here, read-only."
};

const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function ThreadPage(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const { id } = await props.params;
  const sp = (await props.searchParams) || {};
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t, l] = await Promise.all([backendFetch(`/v1/inbox/conversations/${id}`), backendFetch("/v1/inbox/conversations?as=all")]);
  if (!t.ok) notFound();
  const { conversation: c, messages } = (await t.json()) as { conversation: ThreadConversation; messages: ThreadMessage[] };
  const list = l.ok ? ((await l.json()) as { conversations: ConversationListItem[] }).conversations : [];
  const send = sendMessageAction.bind(null, id);
  const act = threadAction.bind(null, id);
  const requestHref = c.request_id ? (c.as === "volunteer" ? `/volunteer/opportunities/${c.request_id}` : null) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <LiveRefresh conversationId={id} />
      <aside aria-label="Conversations" className="hidden lg:block">
        <h2 className="m-0 mb-2 text-base">
          <Link href="/inbox" className="text-ink">
            Inbox
          </Link>
        </h2>
        <ConversationList items={list} activeId={id} />
      </aside>

      <section aria-labelledby="thread-h" className="grid min-w-0 content-start gap-4">
        <p className="m-0 text-sm lg:hidden">
          <Link href="/inbox" className="text-muted">
            ← Inbox
          </Link>
        </p>
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
          <div className="min-w-0">
            <h1 id="thread-h" className="m-0 text-xl">
              {c.with_name}
            </h1>
            <p className="m-0 mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              {requestHref ? <Link href={requestHref} className="text-muted underline">{c.request_title}</Link> : <span>{c.request_title || "Direct message"}</span>}
              {c.application_status ? <StatusPill status={c.application_status} /> : null}
            </p>
          </div>
          {c.status === "active" ? (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-ink">
                <Flag aria-hidden className="mr-1 inline h-4 w-4" /> Safety
              </summary>
              <div className="absolute right-0 z-20 mt-2 grid w-72 gap-3 rounded-md border border-line bg-surface p-4 shadow-pop">
                <form action={act} className="grid gap-2">
                  <input type="hidden" name="kind" value="report" />
                  <label htmlFor="rep-cat" className="text-sm font-medium">
                    Report a concern
                  </label>
                  <select id="rep-cat" name="category" className="h-10 rounded border border-line-strong bg-surface px-2 text-sm">
                    <option value="scam">Scam or asking for money</option>
                    <option value="harassment">Harassment</option>
                    <option value="safety">Safety concern</option>
                    <option value="spam">Spam</option>
                    <option value="inappropriate">Inappropriate</option>
                    <option value="other">Something else</option>
                  </select>
                  <textarea name="details" maxLength={2000} placeholder="What happened? (optional)" className="min-h-[70px] rounded border border-line-strong bg-surface px-2 py-1.5 text-sm" />
                  <Button type="submit" size="sm" variant="secondary">
                    Send report
                  </Button>
                </form>
                <form action={act}>
                  <input type="hidden" name="kind" value="block" />
                  <Button type="submit" size="sm" variant="danger" className="w-full">
                    Block {c.with_name}
                  </Button>
                </form>
                <form action={act}>
                  <input type="hidden" name="kind" value="end" />
                  <Button type="submit" size="sm" variant="ghost" className="w-full">
                    End conversation
                  </Button>
                </form>
              </div>
            </details>
          ) : null}
        </header>

        <p className="m-0 flex items-start gap-2 rounded border border-warning bg-warning-tint px-3 py-2 text-sm" role="note">
          <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            Never share bank details, passwords or codes, and never send money or gift cards.
            {!c.contacts_unlocked ? " Phone numbers, emails and links stay hidden until the volunteer is accepted." : ""}
          </span>
        </p>
        {sp.flash && FLASH[sp.flash] ? <Notice tone="success">{FLASH[sp.flash]}</Notice> : null}
        {sp.error ? <Notice tone="danger">{sp.error}</Notice> : null}

        <ol className="m-0 grid gap-3 p-0" aria-label="Messages">
          {messages.map((m) => (
            <li key={m.id} className={cn("flex list-none", m.mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-lg border px-3.5 py-2.5", m.mine ? "border-primary bg-primary-tint" : "border-line bg-surface")}>
                {!m.mine ? <p className="m-0 mb-0.5 text-xs font-medium text-muted">{m.sender_name}</p> : null}
                <p className="m-0 whitespace-pre-line break-words">{m.body}</p>
                {m.attachment ? (
                  <a href={`/api/inbox/attachments/${m.attachment.id}`} className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    <Paperclip aria-hidden className="h-4 w-4" /> {m.attachment.name} <span className="text-muted">({Math.ceil(m.attachment.size / 1024)} KB)</span>
                  </a>
                ) : null}
                <p className="m-0 mt-1 text-right text-xs text-muted">
                  {time(m.created_at)}
                  {m.status === "held" ? <span className="ml-2 font-medium text-warning">Held for review{m.held_reason ? ` · ${m.held_reason.toLowerCase()}` : ""}</span> : null}
                  {m.status === "rejected" ? <span className="ml-2 font-medium text-danger">Not delivered</span> : null}
                </p>
              </div>
            </li>
          ))}
          {!messages.length ? <li className="list-none text-sm text-muted">No messages yet.</li> : null}
        </ol>

        {c.can_send ? (
          <form action={send} className="grid gap-2 border-t border-line pt-4" encType="multipart/form-data">
            <label htmlFor="msg-body" className="sr-only">
              Message
            </label>
            <textarea id="msg-body" name="body" maxLength={5000} placeholder={`Message ${c.with_name}`} className="min-h-[90px] w-full rounded border border-line-strong bg-surface px-3 py-2" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="grid min-w-0 gap-1 text-sm text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip aria-hidden className="h-4 w-4" /> Attach a file <span className="text-xs">(PDF, image, Word or text, up to 5 MB)</span>
                </span>
                <input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.csv" className="max-w-full text-sm" />
              </label>
              <Button type="submit">Send</Button>
            </div>
          </form>
        ) : (
          <Notice tone="info">{c.status === "archived" ? "This conversation was archived 14 days after the request finished. It's read-only." : "This conversation has ended and is read-only."}</Notice>
        )}
      </section>
    </div>
  );
}
