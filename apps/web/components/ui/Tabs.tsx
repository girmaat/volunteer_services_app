"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../lib/cn";

export type TabItem = { href: string; label: string; exact?: boolean };

/** Link-based tabs for sub-sections of a page (aria-current marks the active one). */
export function LinkTabs({ items, label }: { items: TabItem[]; label: string }) {
  const pathname = usePathname() || "/";
  return (
    <nav aria-label={label} className="-mx-1 mb-6 overflow-x-auto border-b border-line">
      <ul className="m-0 flex list-none gap-1 p-0 px-1">
        {items.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
                  active ? "border-sun text-ink" : "border-transparent text-muted hover:text-ink"
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
