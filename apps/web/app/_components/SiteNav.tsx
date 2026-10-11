"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavUser = {
  role?: "volunteer" | "requester" | "org_admin" | null;
  is_platform_admin?: boolean;
} | null;

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

const publicItems: NavItem[] = [
  { href: "/", label: "Home", exact: true },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/organizations", label: "Organizations" },
  { href: "/impact-stories", label: "Impact Stories" },
  { href: "/about", label: "About" },
  { href: "/help", label: "Help" },
  { href: "/contact", label: "Contact" }
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function roleAdjustedPublicItems(user: NavUser): NavItem[] {
  if (!user?.role) return publicItems;

  if (user.role === "org_admin") {
    return publicItems.map((item) => (item.href === "/opportunities" ? { href: "/org/requests", label: "Requests" } : item));
  }

  if (user.role === "requester") {
    return publicItems.map((item) =>
      item.href === "/opportunities" ? { href: "/requester/dashboard", label: "Requests" } : item
    );
  }

  return publicItems;
}

export default function SiteNav({ user }: { user: NavUser }) {
  const pathname = usePathname() || "/";

  const authedItems: NavItem[] = user
    ? [{ href: "/dashboard", label: "Dashboard" }].concat(user.is_platform_admin ? [{ href: "/admin", label: "Admin" }] : [])
    : [
        { href: "/login", label: "Log in", exact: true },
        { href: "/signup", label: "Sign up", exact: true }
      ];

  return (
    <nav className="nav" aria-label="Global navigation">
      {[...roleAdjustedPublicItems(user), ...authedItems].map((item) => {
        const active = isActive(pathname, item.href, item.exact);

        return (
          <Link key={item.href} className={"navLink" + (active ? " navLinkActive" : "")} href={item.href}>
            {item.label}
          </Link>
        );
      })}

      {user ? (
        <a className="navLink" href="/api/auth/logout">
          Log out
        </a>
      ) : null}
    </nav>
  );
}
