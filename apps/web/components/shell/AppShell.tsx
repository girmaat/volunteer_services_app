import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { BottomNav, SideNav, TopNav } from "./AppNav";
import UserMenu from "./UserMenu";
import ContextSwitcher, { type ContextOption } from "./ContextSwitcher";
import NotificationBell from "./NotificationBell";
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
 * Signed-in layout. Volunteer, requester, organization, inbox and settings pages use a top
 * navigation bar like the public site; only the platform admin tools keep a (dark) sidebar.
 * Small screens get a compact top bar plus bottom tabs everywhere.
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
  // Moderators (not admins) only see the queues they can work.
  const items = context === "admin" && !user.is_platform_admin ? navFor("admin").filter((i) => ["/admin/moderation", "/admin/opportunities"].includes(i.href)) : navFor(context);
  const label = contextLabel(context, orgName);
  const name = user.display_name || user.email.split("@")[0];

  const contextList = user.contexts ?? [];
  const isCurrent = (c: string) => (c.startsWith("org:") ? context === "org" && (!orgSlug || c === `org:${orgSlug}`) : c === context);
  const options: ContextOption[] = contextList.map((c) => ({ value: c, label: optionLabel(c, user), current: isCurrent(c) }));
  const roles = user.roles ?? [];
  const canAddRole = !(roles.includes("volunteer") && roles.includes("requester"));
  // The platform admin area gets a dark sidebar so staff always know they're in the admin tools.
  const adminTheme = context === "admin" ? " admin-chrome" : "";

  if (context !== "admin") {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--paper)_88%,transparent)]">
          <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6 lg:h-16">
            <Logo href={items[0]?.href ?? "/"} wordmarkClassName="hidden min-[400px]:inline" />
            <div className="hidden min-w-0 flex-1 lg:flex">
              <TopNav items={items} label={label} />
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              {options.length > 1 || canAddRole ? (
                <div className="w-36 min-w-0 xl:w-44">
                  <ContextSwitcher options={options} currentLabel={label} canAddRole={canAddRole} compact />
                </div>
              ) : null}
              <NotificationBell />
              <UserMenu name={name} email={user.email} profileHref={profileHref(context)} compact />
            </div>
          </div>
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          {children}
        </main>
        <BottomNav items={items} label={label} />
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside aria-label="Sidebar" className={`sticky top-0 hidden h-screen flex-col border-r border-line bg-surface px-4 py-5 lg:flex${adminTheme}`}>
        <div className="px-2">
          <div className="flex items-center justify-between">
            <Logo href={items[0]?.href ?? "/"} />
            <NotificationBell />
          </div>
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
        <header className={`sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface px-4 lg:hidden${adminTheme}`}>
          <Logo href={items[0]?.href ?? "/"} wordmarkClassName="hidden min-[400px]:inline" />
          <div className="flex min-w-0 items-center gap-1">
            <NotificationBell />
            {options.length > 1 ? (
              <div className="w-36 min-w-0">
                <ContextSwitcher options={options} currentLabel={label} canAddRole={canAddRole} compact />
              </div>
            ) : null}
            <UserMenu name={name} email={user.email} profileHref={profileHref(context)} compact />
          </div>
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <BottomNav items={items} label={label} className={adminTheme.trim()} />
    </div>
  );
}
