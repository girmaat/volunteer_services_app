"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "User management" },
  { href: "/admin/organizations", label: "Organization management" },
  { href: "/admin/opportunities", label: "Opportunity management" },
  // divider
  { href: "/admin/reports", label: "Reports queue" },
  { href: "/admin/incidents", label: "Incident review" },
  { href: "/admin/verification", label: "Verification review" },
  { href: "/admin/enforcement", label: "Strike / ban management" }
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminSidebarNav() {
  const pathname = usePathname() || "";

  return (
    <>
      {ITEMS.slice(0, 4).map((i) => (
        <Link key={i.href} href={i.href} className={isActive(pathname, i.href) ? "active" : ""}>
          {i.label}
        </Link>
      ))}
      <div style={{ height: 1, background: "var(--border)", margin: "0.25rem 0" }} />
      {ITEMS.slice(4).map((i) => (
        <Link key={i.href} href={i.href} className={isActive(pathname, i.href) ? "active" : ""}>
          {i.label}
        </Link>
      ))}
    </>
  );
}
