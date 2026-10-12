/**
 * Authorization policy: the one place that decides what a user may do.
 *
 * Route guards and handlers call `can(user, action)` instead of comparing `user.role` /
 * `account_type` strings. The session loader (`auth/session.ts`) attaches `roles`, `orgs`,
 * `platform_role`, `active_context` and `trust_tier` to every authenticated user.
 */

export type MemberRole = "volunteer" | "requester";
export type OrgMembership = { slug: string; name: string; role: "admin" | "manager" | "member" | "coordinator" };
export type PlatformRole = "moderator" | "admin" | "super" | null;
export type TrustTier = "unverified" | "basic" | "trusted";
export type ActiveContext = "volunteer" | "requester" | "admin" | `org:${string}`;

export type PolicyUser = {
  id: string;
  email?: string;
  role?: string | null;
  roles?: string[];
  orgs?: OrgMembership[];
  platform_role?: PlatformRole;
  active_context?: string | null;
  trust_tier?: TrustTier;
  shadow_banned?: boolean;
  [k: string]: unknown;
};

export type Action =
  | "volunteer:act" // browse feeds, apply, volunteer history
  | "requester:act" // post and manage own requests
  | "org:act" // act inside an organization the user belongs to
  | "org:manage" // org admin or manager
  | "org:admin" // org admin only
  | "platform:moderate" // work moderation queues (reports, sensitive requests, disputes)
  | "platform:admin" // platform admin (users, orgs, content)
  | "platform:super" // settings, granting admins
  | "role:add"; // add volunteer/requester to own account

const PLATFORM_RANK: Record<string, number> = { moderator: 1, admin: 2, super: 3 };

export function hasRole(user: PolicyUser | null | undefined, role: MemberRole): boolean {
  return Boolean(user?.roles?.includes(role));
}

export function orgMembership(user: PolicyUser | null | undefined, slug?: string | null): OrgMembership | null {
  const orgs = user?.orgs || [];
  if (!orgs.length) return null;
  if (slug) return orgs.find((o) => o.slug === slug) || null;
  const fromContext = contextOrgSlug(user?.active_context);
  return (fromContext && orgs.find((o) => o.slug === fromContext)) || orgs[0];
}

export function contextOrgSlug(ctx: string | null | undefined): string | null {
  return ctx && ctx.startsWith("org:") ? ctx.slice(4) : null;
}

function platformRank(user: PolicyUser | null | undefined) {
  return PLATFORM_RANK[String(user?.platform_role || "")] || 0;
}

export function can(user: PolicyUser | null | undefined, action: Action, opts: { orgSlug?: string | null } = {}): boolean {
  if (!user) return false;
  switch (action) {
    case "volunteer:act":
      return hasRole(user, "volunteer");
    case "requester:act":
      return hasRole(user, "requester");
    case "org:act":
      return Boolean(orgMembership(user, opts.orgSlug));
    case "org:manage": {
      const m = orgMembership(user, opts.orgSlug);
      return Boolean(m && (m.role === "admin" || m.role === "manager"));
    }
    case "org:admin":
      return orgMembership(user, opts.orgSlug)?.role === "admin";
    case "platform:moderate":
      return platformRank(user) >= 1;
    case "platform:admin":
      return platformRank(user) >= 2;
    case "platform:super":
      return platformRank(user) >= 3;
    case "role:add":
      return true;
  }
}

/** Contexts a user can switch between, in display order. */
export function availableContexts(user: PolicyUser): ActiveContext[] {
  const out: ActiveContext[] = [];
  if (hasRole(user, "volunteer")) out.push("volunteer");
  if (hasRole(user, "requester")) out.push("requester");
  for (const o of user.orgs || []) out.push(`org:${o.slug}`);
  if (can(user, "platform:moderate")) out.push("admin");
  return out;
}

export function isValidContext(user: PolicyUser, ctx: string): ctx is ActiveContext {
  return (availableContexts(user) as string[]).includes(ctx);
}

/**
 * The legacy single `role` value for the active context ("volunteer" | "requester" | "org_admin").
 * Older handlers read `user.role`; route guards also pin it to the area being called.
 */
export function effectiveLegacyRole(user: PolicyUser): string | null {
  const ctx = user.active_context || "";
  if (ctx === "volunteer" && hasRole(user, "volunteer")) return "volunteer";
  if (ctx === "requester" && hasRole(user, "requester")) return "requester";
  if (ctx.startsWith("org:") && orgMembership(user, contextOrgSlug(ctx))) return "org_admin";
  const legacy = String(user.role || "");
  if (legacy === "volunteer" || legacy === "requester") {
    if (hasRole(user, legacy)) return legacy;
  }
  if (legacy === "org_admin" && (user.orgs || []).length) return "org_admin";
  if (hasRole(user, "volunteer")) return "volunteer";
  if (hasRole(user, "requester")) return "requester";
  if ((user.orgs || []).length) return "org_admin";
  return legacy || null;
}

/** Where a context's home is in the web app. */
export function homeFor(ctx: string | null | undefined): string {
  if (ctx === "volunteer") return "/volunteer/dashboard";
  if (ctx === "requester") return "/requester/dashboard";
  if (ctx === "admin") return "/admin";
  if (ctx && ctx.startsWith("org:")) return "/org/dashboard";
  return "/dashboard";
}
