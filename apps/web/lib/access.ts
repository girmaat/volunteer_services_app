/** Role helpers for the web app; mirror apps/api/src/lib/policy.ts. */
type U = {
  role?: string | null;
  roles?: string[];
  orgs?: { slug: string; name: string; role: string }[];
  platform_role?: string | null;
  platform_admin_role?: string | null;
  is_platform_admin?: boolean;
  active_context?: string | null;
} | null | undefined;

export function hasRole(user: U, role: "volunteer" | "requester"): boolean {
  if (!user) return false;
  if (Array.isArray(user.roles)) return user.roles.includes(role);
  return user.role === role;
}

export function inOrg(user: U): boolean {
  if (!user) return false;
  if (Array.isArray(user.orgs)) return user.orgs.length > 0;
  return user.role === "org_admin";
}

export function isModerator(user: U): boolean {
  const r = user?.platform_role ?? user?.platform_admin_role;
  return Boolean(user?.is_platform_admin || r === "moderator" || r === "admin" || r === "super");
}

export function activeOrgSlug(user: U): string | null {
  const ctx = user?.active_context || "";
  if (ctx.startsWith("org:")) return ctx.slice(4);
  return user?.orgs?.[0]?.slug ?? null;
}

export const CONTEXT_HOME: Record<string, string> = {
  volunteer: "/volunteer/dashboard",
  requester: "/requester/dashboard",
  admin: "/admin"
};

export function homeForContext(ctx: string | null | undefined): string {
  if (!ctx) return "/dashboard";
  if (ctx.startsWith("org:")) return "/org/dashboard";
  return CONTEXT_HOME[ctx] ?? "/dashboard";
}
