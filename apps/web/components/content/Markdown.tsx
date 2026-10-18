import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A small, safe Markdown subset for the information pages: ## / ### headings, paragraphs, - and 1.
 * lists, **bold** and [links](/path). No raw HTML is ever rendered.
 */
type Block = { kind: "h2" | "h3" | "p"; text: string } | { kind: "ul" | "ol"; items: string[] };

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function parse(body: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
    if (list) out.push(list);
    list = null;
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if (!line) flush();
    else if ((m = /^###\s+(.+)$/.exec(line))) (flush(), out.push({ kind: "h3", text: m[1]! }));
    else if ((m = /^##\s+(.+)$/.exec(line))) (flush(), out.push({ kind: "h2", text: m[1]! }));
    else if ((m = /^[-*]\s+(.+)$/.exec(line)) || (m = /^\d+[.)]\s+(.+)$/.exec(line))) {
      const kind = /^[-*]/.test(line) ? "ul" : "ol";
      if (para.length) (out.push({ kind: "p", text: para.join(" ") }), (para = []));
      if (!list || list.kind !== kind) {
        if (list) out.push(list);
        list = { kind, items: [] };
      }
      list.items.push(m[1]!);
    } else {
      if (list) (out.push(list), (list = null));
      para.push(line);
    }
  }
  flush();
  return out;
}

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<strong key={i++}>{m[1]}</strong>);
    else {
      const href = m[3]!;
      const safe = /^(\/|#|https:\/\/|mailto:)/.test(href) ? href : "#";
      parts.push(
        safe.startsWith("/") || safe.startsWith("#") ? (
          <Link key={i++} prefetch={false} href={safe} className="font-medium text-primary underline">
            {m[2]}
          </Link>
        ) : (
          <a key={i++} href={safe} className="font-medium text-primary underline" rel="noopener noreferrer">
            {m[2]}
          </a>
        )
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ body }: { body: string }) {
  return (
    <div className="grid gap-4 leading-relaxed">
      {parse(body).map((b, k) => {
        if (b.kind === "h2")
          return (
            <h2 key={k} id={slugify(b.text)} className="m-0 mt-6 scroll-mt-24 text-xl first:mt-0">
              {b.text}
            </h2>
          );
        if (b.kind === "h3")
          return (
            <h3 key={k} className="m-0 mt-2 text-base font-semibold">
              {b.text}
            </h3>
          );
        if (b.kind === "p")
          return (
            <p key={k} className="m-0">
              {inline(b.text)}
            </p>
          );
        if (b.kind !== "ul" && b.kind !== "ol") return null;
        const L = b.kind;
        return (
          <L key={k} className={`m-0 grid gap-1.5 pl-6 ${b.kind === "ul" ? "list-disc" : "list-decimal"}`}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </L>
        );
      })}
    </div>
  );
}
