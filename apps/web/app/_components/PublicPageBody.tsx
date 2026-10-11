import React from "react";

type Props = {
  body: string;
};

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function flushParagraph(blocks: Block[], paragraphLines: string[]) {
  const text = paragraphLines.join(" ").trim();
  if (text) blocks.push({ kind: "p", text });
  paragraphLines.length = 0;
}

function flushList(blocks: Block[], kind: "ul" | "ol", items: string[]) {
  const trimmed = items.map((i) => i.trim()).filter(Boolean);
  if (trimmed.length) blocks.push({ kind, items: trimmed });
  items.length = 0;
}

function parseBody(body: string): Block[] {
  const lines = (body || "").split(/\r?\n/);
  const blocks: Block[] = [];

  const paragraph: string[] = [];
  const bullets: string[] = [];
  const ordered: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();

    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, "ul", bullets);
      flushList(blocks, "ol", ordered);
      blocks.push({ kind: "h2", text: h2[1].trim() });
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, "ul", bullets);
      flushList(blocks, "ol", ordered);
      blocks.push({ kind: "h3", text: h3[1].trim() });
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, "ol", ordered);
      bullets.push(bullet[1]);
      continue;
    }

    const orderedItem = /^\d+[\.)]\s+(.+)$/.exec(line);
    if (orderedItem) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, "ul", bullets);
      ordered.push(orderedItem[1]);
      continue;
    }

    if (!line) {
      flushParagraph(blocks, paragraph);
      flushList(blocks, "ul", bullets);
      flushList(blocks, "ol", ordered);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph(blocks, paragraph);
  flushList(blocks, "ul", bullets);
  flushList(blocks, "ol", ordered);

  return blocks;
}

export default function PublicPageBody({ body }: Props) {
  const blocks = React.useMemo(() => parseBody(body), [body]);

  return (
    <>
      {blocks.map((b, idx) => {
        if (b.kind === "h2") return <h2 key={idx}>{b.text}</h2>;
        if (b.kind === "h3") return <h3 key={idx}>{b.text}</h3>;
        if (b.kind === "p") return <p key={idx}>{b.text}</p>;
        if (b.kind === "ul") {
          return (
            <ul key={idx}>
              {b.items.map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          );
        }
        return (
          <ol key={idx}>
            {b.items.map((it, j) => <li key={j}>{it}</li>)}
          </ol>
        );
      })}
    </>
  );
}
