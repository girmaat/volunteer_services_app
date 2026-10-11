"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { buttonClass } from "../ui/Button";
import { cn } from "../../lib/cn";

type SessionUser = { role: string | null; is_platform_admin: boolean; onboarding_completed?: boolean; has_org?: boolean } | null;

const LINKS = [
  { href: "/opportunities", label: "Opportunities" },
  { href: "/organizations", label: "Organizations" },
  { href: "/how-it-works", label: "How it works" }
];

/** Header for public pages. Signed-in visitors get a single "Go to my dashboard" action. */
export default function MarketingHeader() {
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<SessionUser | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => active && setUser(d?.user ?? null))
      .catch(() => active && setUser(null));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  const actions =
    user === undefined ? (
      <span className="inline-block h-10 w-40" aria-hidden />
    ) : user ? (
      user.onboarding_completed === false && !user.has_org && !user.is_platform_admin ? (
        <Link className={buttonClass("primary", "md")} href="/onboarding">
          Finish setting up
        </Link>
      ) : (
        <Link className={buttonClass("primary", "md")} href={user.is_platform_admin ? "/admin" : "/dashboard"}>
          Go to my dashboard
        </Link>
      )
    ) : (
      <>
        <Link className={buttonClass("ghost", "md")} href="/login">
          Log in
        </Link>
        <Link className={buttonClass("primary", "md")} href="/signup">
          Sign up
        </Link>
      </>
    );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--paper)_88%,transparent)]">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-6 px-5">
        <Logo />
        <nav aria-label="Main" className="hidden flex-1 md:block">
          <ul className="m-0 flex list-none gap-1 p-0">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("rounded px-3 py-2 text-sm font-medium", active ? "text-ink underline decoration-sun decoration-2 underline-offset-8" : "text-muted hover:text-ink")}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 md:flex">{actions}</div>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded border border-line bg-surface md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {open ? (
        <div id="mobile-menu" className="border-t border-line bg-surface px-5 pb-5 pt-2 md:hidden">
          <ul className="m-0 grid list-none gap-1 p-0">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block rounded px-2 py-3 text-base font-medium">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
        </div>
      ) : null}
    </header>
  );
}
