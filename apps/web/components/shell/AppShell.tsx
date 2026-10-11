import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { BottomNav, SideNav } from "./AppNav";
import UserMenu, { type MenuContext } from "./UserMenu";
import { contextLabel, navFor, profileHref, type AppContext } from "./nav";

type ShellUser = { email: string; role?: string | null; is_platform_admin?: boolean; display_name?: string | null };

/**
 * Signed-in layout: sidebar on large screens, top bar + bottom tabs on small screens.
 * Every signed-in area (volunteer, requester, org, settings, admin) renders inside it.
 */
export default function AppShell({
  user,
  context,
  orgName,
  banner,
  children
}: {
  user: ShellUser;
  context: AppContext;
  orgName?: string | null;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const items = navFor(context);
  const label = contextLabel(context, orgName);
  const name = user.display_name || user.email.split("@")[0];

  const contexts: MenuContext[] = [];
  if (user.role === "volunteer" || user.role === "requester") {
    contexts.push({ href: user.role === "volunteer" ? "/volunteer/dashboard" : "/requester/dashboard", label: user.role === "volunteer" ? "Volunteering" : "Requesting help", current: context === user.role });
  }
  if (user.role === "org_admin") contexts.push({ href: "/org/dashboard", label: orgName || "Organization", current: context === "org" });
  if (user.is_platform_admin) contexts.push({ href: "/admin", label: "Platform admin", current: context === "admin" });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <div className="px-2">
          <Logo href={items[0]?.href ?? "/"} />
          <p className="m-0 mt-4 truncate text-xs font-medium text-muted">{label}</p>
        </div>
        <div className="mt-2 flex-1 overflow-y-auto pl-3 pr-1">
          <SideNav items={items} label={label} />
        </div>
        <div className="border-t border-line pt-3">
          <UserMenu name={name} email={user.email} profileHref={profileHref(context)} contexts={contexts} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
          <Logo href={items[0]?.href ?? "/"} />
          <div className="flex items-center gap-1">
            <Link href="/settings" className="rounded px-2 py-1.5 text-sm text-muted">
              Settings
            </Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="rounded border-0 bg-transparent px-2 py-1.5 text-sm text-muted">
                Log out
              </button>
            </form>
          </div>
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav items={items} label={label} />
    </div>
  );
}
