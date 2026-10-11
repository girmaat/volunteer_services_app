"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./volunteer.module.css";

type Tab = { href: string; label: string };

const tabs: Tab[] = [
  { href: "/volunteer/dashboard", label: "Overview" },
  { href: "/volunteer/opportunities/recommended", label: "Opportunities" },
  { href: "/volunteer/applications", label: "Applications" },
  { href: "/volunteer/messages", label: "Messages" },
  { href: "/volunteer/calendar", label: "Calendar" },
  { href: "/volunteer/history", label: "History" },
  { href: "/volunteer/profile", label: "Profile" },
  { href: "/settings", label: "Settings" }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // exact match or any nested route under href
  return pathname === href || pathname.startsWith(href + "/");
}

export default function VolunteerNav() {
  const pathname = usePathname() || "";

  return (
    <nav className={styles.nav} aria-label="Volunteer navigation">
      {tabs.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`${styles.navLink} ${active ? styles.navActive : ""}`.trim()}
            aria-current={active ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
