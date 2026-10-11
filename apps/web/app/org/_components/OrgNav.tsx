"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./orgTabs.module.css";

type Tab = { href: string; label: string };

const tabs: Tab[] = [
  { href: "/org/dashboard", label: "Dashboard" },
  { href: "/org/requests", label: "Requests" },
  { href: "/org/applications", label: "Applications" },
  { href: "/org/roster", label: "Roster" },
  { href: "/org/attendance", label: "Attendance" },
  { href: "/org/incidents", label: "Incidents" },
  { href: "/org/documents", label: "Docs" },
  { href: "/org/reports", label: "Reports" },
  { href: "/org/messages", label: "Inbox" },
  { href: "/org/team", label: "Team" },
  { href: "/org/onboarding", label: "Onboarding" },
  { href: "/org/settings", label: "Settings" },
];

export default function OrgNav() {
  const pathname = usePathname() || "";

  return (
    <nav className={styles.nav} aria-label="Organization navigation">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`${styles.navLink} ${active ? styles.navActive : ""}`.trim()}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
