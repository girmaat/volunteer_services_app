import Link from "next/link";

export type Stat = { label: string; value: number | string; href?: string; hint?: string; attention?: boolean };

/** A row of key numbers in one panel, each linking to where you act on it. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <ul className="m-0 grid list-none p-0 overflow-hidden rounded-md border border-line bg-surface grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {stats.map((s) => {
        const body = (
          <>
            <span className="block text-sm text-muted">{s.label}</span>
            <span className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-ink">
              {s.value}
              {s.attention ? <span role="img" aria-label="needs attention" className="h-2 w-2 rounded-full bg-sun" /> : null}
            </span>
            {s.hint ? <span className="mt-0.5 block text-xs text-muted">{s.hint}</span> : null}
          </>
        );
        return (
          <li key={s.label} className="border-b border-r border-line lg:border-b-0">
            {s.href ? (
              <Link href={s.href} className="block h-full px-5 py-4 text-ink no-underline hover:bg-[var(--muted-bg)] hover:text-ink">
                {body}
              </Link>
            ) : (
              <div className="px-5 py-4">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
