"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { ChevronDown, LifeBuoy, LogOut, Settings, UserRound } from "lucide-react";

/** Avatar menu: profile, settings, help, log out. (Context switching lives in the switcher next to it.) */
export default function UserMenu({ name, email, profileHref, compact = false }: { name: string; email: string; profileHref: string; compact?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const item = "flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-primary-tint data-[highlighted]:text-primary";
  return (
    <Dropdown.Root>
      {compact ? (
        <Dropdown.Trigger className="flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent p-0" aria-label="Account menu">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-ink">
            {initials || "?"}
          </span>
        </Dropdown.Trigger>
      ) : (
      <Dropdown.Trigger className="flex w-full items-center gap-2.5 rounded border border-transparent bg-transparent px-2 py-2 text-left hover:bg-[var(--muted-bg)]" aria-label="Account menu">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-ink">
            {initials || "?"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted">{email}</span>
          </span>
          <ChevronDown aria-hidden className="h-4 w-4 text-muted" />
        </Dropdown.Trigger>
      )}
      <Dropdown.Portal>
        <Dropdown.Content side={compact ? "bottom" : "top"} align={compact ? "end" : "start"} sideOffset={6} className="z-50 min-w-[240px] rounded-md border border-line bg-surface p-1.5 shadow-pop">
          <Dropdown.Item asChild className={item}>
            <Link prefetch={false} href={profileHref}>
              <UserRound aria-hidden className="h-4 w-4" /> Profile
            </Link>
          </Dropdown.Item>
          <Dropdown.Item asChild className={item}>
            <Link prefetch={false} href="/settings">
              <Settings aria-hidden className="h-4 w-4" /> Settings
            </Link>
          </Dropdown.Item>
          <Dropdown.Item asChild className={item}>
            <Link prefetch={false} href="/help">
              <LifeBuoy aria-hidden className="h-4 w-4" /> Help
            </Link>
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          <form action="/api/auth/logout" method="post">
            <Dropdown.Item asChild className={item}>
              <button type="submit" className="w-full border-0 bg-transparent text-left">
                <LogOut aria-hidden className="h-4 w-4" /> Log out
              </button>
            </Dropdown.Item>
          </form>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
