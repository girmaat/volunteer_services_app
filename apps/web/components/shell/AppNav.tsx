"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./Icon";
import { NavPending } from "./NavPending";
import type { NavItem } from "./nav";
import { cn } from "../../lib/cn";

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Sidebar navigation (desktop). */
export function SideNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname() || "/";
  return (
    <nav aria-label={label}>
      <ul className="m-0 grid list-none gap-0.5 p-0">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link prefetch={false}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded px-3 py-2 text-[0.9375rem] font-medium",
                  active ? "bg-primary-tint text-primary" : "text-muted hover:bg-[var(--muted-bg)] hover:text-ink"
                )}
              >
                {active ? <span aria-hidden className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r bg-sun" /> : null}
                <NavIcon name={item.icon} />
                {item.label}
                <NavPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bottom tab bar (mobile): first five destinations. */
export function BottomNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname() || "/";
  const shown = items.slice(0, 5);
  return (
    <nav aria-label={`${label} shortcuts`} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link prefetch={false}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 px-1 py-2 text-[0.6875rem] font-medium leading-tight", active ? "text-primary" : "text-muted")}
              >
                <NavIcon name={item.icon} className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
