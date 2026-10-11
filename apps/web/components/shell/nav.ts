export type AppContext = "volunteer" | "requester" | "org" | "admin";

export type NavItem = { href: string; label: string; icon: IconName; match?: string[]; exact?: boolean };
export type IconName =
  | "home" | "search" | "clipboard" | "calendar" | "inbox" | "award" | "list" | "users" | "star" | "chart" | "building" | "settings" | "shield" | "flag" | "file";

/** Primary navigation per context: at most 7 items, plain-language labels. */
export function navFor(ctx: AppContext): NavItem[] {
  switch (ctx) {
    case "volunteer":
      return [
        { href: "/volunteer/dashboard", label: "Home", icon: "home" },
        { href: "/volunteer/opportunities/recommended", label: "Find opportunities", icon: "search", match: ["/volunteer/opportunities"] },
        { href: "/volunteer/applications", label: "My applications", icon: "clipboard" },
        { href: "/volunteer/calendar", label: "Schedule", icon: "calendar" },
        { href: "/inbox", label: "Inbox", icon: "inbox" },
        { href: "/volunteer/history", label: "Impact", icon: "award" }
      ];
    case "requester":
      return [
        { href: "/requester/dashboard", label: "Home", icon: "home" },
        { href: "/requester/requests", label: "My requests", icon: "list" },
        { href: "/requester/applications", label: "Applicants", icon: "users" },
        { href: "/inbox", label: "Inbox", icon: "inbox" },
        { href: "/requester/reputation", label: "Reviews", icon: "star" }
      ];
    case "org":
      return [
        { href: "/org/dashboard", label: "Home", icon: "home" },
        { href: "/org/requests", label: "Requests", icon: "list" },
        { href: "/org/applications", label: "Applicants", icon: "users" },
        { href: "/org/roster", label: "People", icon: "clipboard", match: ["/org/roster", "/org/attendance", "/org/documents", "/org/incidents"] },
        { href: "/inbox", label: "Inbox", icon: "inbox" },
        { href: "/org/reports", label: "Reports", icon: "chart" },
        { href: "/org/team", label: "Organization", icon: "building", match: ["/org/team", "/org/settings", "/org/onboarding"] }
      ];
    case "admin":
      return [
        { href: "/admin", label: "Overview", icon: "home", exact: true },
        { href: "/admin/moderation", label: "Moderation", icon: "flag", match: ["/admin/moderation", "/admin/reports", "/admin/incidents"] },
        { href: "/admin/opportunities", label: "Requests", icon: "list" },
        { href: "/admin/users", label: "Users", icon: "users", match: ["/admin/users", "/admin/enforcement"] },
        { href: "/admin/organizations", label: "Organizations", icon: "building", match: ["/admin/organizations", "/admin/org-verification"] },
        { href: "/admin/verification", label: "Verification", icon: "shield" },
        { href: "/admin/audit", label: "Audit log", icon: "file" }
      ];
  }
}

export function contextLabel(ctx: AppContext, orgName?: string | null) {
  if (ctx === "volunteer") return "Volunteering";
  if (ctx === "requester") return "Requesting help";
  if (ctx === "admin") return "Platform admin";
  return orgName || "Organization";
}

export function profileHref(ctx: AppContext) {
  if (ctx === "volunteer") return "/volunteer/profile";
  if (ctx === "requester") return "/requester/profile";
  if (ctx === "org") return "/org/settings";
  return "/settings";
}

/** Public paths under /org that are reachable before an organization exists. */
export const PUBLIC_ORG_PATHS = ["/org/signup", "/org/invite", "/org/enroll"];
/** Areas that render the signed-in app shell (their layouts render it). */
export const APP_AREAS = ["/volunteer", "/requester", "/org", "/settings", "/admin", "/inbox"];

/** The default context for a signed-in user (used by shared areas such as Settings). */
export function defaultContext(user: { role?: string | null; active_context?: string | null; is_platform_admin?: boolean }): AppContext {
  const ctx = user.active_context || "";
  if (ctx.startsWith("org:")) return "org";
  if (ctx === "volunteer" || ctx === "requester" || ctx === "admin") return ctx;
  if (user.role === "org_admin") return "org";
  if (user.role === "requester") return "requester";
  if (user.role === "volunteer") return "volunteer";
  return user.is_platform_admin ? "admin" : "volunteer";
}
