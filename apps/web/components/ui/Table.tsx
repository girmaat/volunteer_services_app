import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Data table. Wraps in a horizontally scrollable region so wide tables never push the page
 * sideways on a phone; the caption names the table for screen readers.
 */
export function Table({ caption, captionHidden = true, className, children }: { caption: string; captionHidden?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-md border border-line bg-surface" role="region" aria-label={caption} tabIndex={0}>
      <table className={cn("w-full border-collapse text-sm", className)}>
        <caption className={captionHidden ? "srOnly" : "p-3 text-left text-sm font-semibold text-ink"}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...rest }: ComponentProps<"th">) {
  return <th scope="col" className={cn("whitespace-nowrap border-b border-line bg-wash px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)} {...rest} />;
}

export function Td({ className, ...rest }: ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-3 py-2.5 align-top text-ink", className)} {...rest} />;
}

/**
 * Previous / next pagination driven by URL params, so it works without JavaScript and pages
 * are linkable. Pass the current query (minus the page key) in `params`.
 */
export function Pagination({
  basePath,
  params = {},
  page,
  hasNext,
  total,
  pageSize,
  pageParam = "page"
}: {
  basePath: string;
  params?: Record<string, string | undefined>;
  page: number;
  hasNext: boolean;
  total?: number;
  pageSize?: number;
  pageParam?: string;
}) {
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set(pageParam, String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const pages = total !== undefined && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const linkCls = "inline-flex h-9 items-center gap-1 rounded border border-line-strong bg-surface px-3 text-sm font-medium text-ink no-underline hover:border-ink";
  const offCls = "inline-flex h-9 items-center gap-1 rounded border border-line px-3 text-sm text-muted opacity-60";
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link prefetch={false} href={href(page - 1)} className={linkCls} rel="prev">
          <ChevronLeft aria-hidden className="h-4 w-4" /> Previous
        </Link>
      ) : (
        <span className={offCls} aria-disabled="true">
          <ChevronLeft aria-hidden className="h-4 w-4" /> Previous
        </span>
      )}
      <span className="text-sm text-muted" aria-current="page">
        Page {page}
        {pages ? ` of ${pages}` : ""}
      </span>
      {hasNext ? (
        <Link prefetch={false} href={href(page + 1)} className={linkCls} rel="next">
          Next <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      ) : (
        <span className={offCls} aria-disabled="true">
          Next <ChevronRight aria-hidden className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
