import Link from "next/link";
import Markdown, { parse, slugify } from "./Markdown";
import type { InfoPageContent } from "../../content/pages";

/** Layout for the information pages (About, Help, Terms, Privacy…): title, lead, contents and body. */
export default function InfoPage({ page }: { page: InfoPageContent }) {
  const headings = parse(page.body).filter((b): b is { kind: "h2"; text: string } => b.kind === "h2");
  return (
    <article className="mx-auto grid max-w-5xl gap-8 py-4 lg:grid-cols-[1fr_220px]">
      <div className="grid min-w-0 content-start gap-6">
        <header className="grid gap-3 border-b border-line pb-6">
          {page.kicker ? <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">{page.kicker}</p> : null}
          <h1 className="m-0 text-3xl sm:text-4xl">{page.title}</h1>
          <p className="m-0 max-w-2xl text-lg text-muted">{page.lead}</p>
          {page.updated ? <p className="m-0 text-sm text-muted">Last updated {page.updated}</p> : null}
        </header>
        <div className="max-w-3xl">
          <Markdown body={page.body} />
        </div>
      </div>
      {headings.length > 2 ? (
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 grid gap-2 border-l border-line pl-4">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">On this page</p>
            {headings.map((h) => (
              <Link key={h.text} prefetch={false} href={`#${slugify(h.text)}`} className="text-sm text-muted no-underline hover:text-primary">
                {h.text}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </article>
  );
}
