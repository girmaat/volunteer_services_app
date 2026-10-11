import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { BottomNav, SideNav } from "./AppNav";
import UserMenu from "./UserMenu";
import ContextSwitcher, { type ContextOption } from "./ContextSwitcher";
import { contextLabel, navFor, profileHref, type AppContext } from "./nav";

type ShellUser = {
  email: string;
  role?: string | null;
  roles?: string[];
  orgs?: { slug: string; name: string }[];
  contexts?: string[];
  is_platform_admin?: boolean;
  platform_admin_role?: string | null;
  display_name?: string | null;
};

function optionLabel(ctx: string, user: ShellUser) {
  if (ctx === "volunteer") return "Volunteering";
  if (ctx === "requester") return "Requesting help";
  if (ctx === "admin") return "Platform admin";
  const slug = ctx.slice(4);
  return user.orgs?.find((o) => o.slug === slug)?.name || "Organization";
}

/**
 * Signed-in layout: sidebar on large screens, top bar + bottom tabs on small screens.
 * Every signed-in area (volunteer, requester, org, settings, admin) renders inside it.
 */
export default function AppShell({
  user,
  context,
  orgName,
  orgSlug,
  banner,
  children
}: {
  user: ShellUser;
  context: AppContext;
  orgName?: string | null;
  orgSlug?: string | null;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const items = navFor(context);
  const label = contextLabel(context, orgName);
  const name = user.display_name || user.email.split("@")[0];

  const contextList = user.contexts ?? [];
  const isCurrent = (c: string) => (c.startsWith("org:") ? context === "org" && (!orgSlug || c === `org:${orgSlug}`) : c === context);
  const options: ContextOption[] = contextList.map((c) => ({ value: c, label: optionLabel(c, user), current: isCurrent(c) }));
  const roles = user.roles ?? [];
  const canAddRole = !(roles.includes("volunteer") && roles.includes("requester"));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside aria-label="Sidebar" className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <div className="px-2">
          <Logo href={items[0]?.href ?? "/"} />
          <ContextSwitcher options={options} currentLabel={label} canAddRole={canAddRole} />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto pl-3 pr-1">
          <SideNav items={items} label={label} />
        </div>
        <div className="border-t border-line pt-3">
          <UserMenu name={name} email={user.email} profileHref={profileHref(context)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
          <Logo href={items[0]?.href ?? "/"} />
          <div className="flex items-center gap-1">
            {options.length > 1 ? (
              <div className="w-40">
                <ContextSwitcher options={options} currentLabel={label} canAddRole={canAddRole} compact />
              </div>
            ) : null}
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
