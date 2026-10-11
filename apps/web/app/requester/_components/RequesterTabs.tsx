"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../requester.module.css";

type Tab = { href: string; label: string };

const tabs: Tab[] = [
  { href: "/requester/dashboard", label: "Dashboard" },
  { href: "/requester/requests", label: "Requests" },
  { href: "/requester/organizations", label: "Organizations" },
  { href: "/requester/applications", label: "Applications" },
  { href: "/requester/messages", label: "Messages" },
  { href: "/requester/profile", label: "Profile" },
  { href: "/settings", label: "Settings" }
];

export default function RequesterTabs() {
  const pathname = usePathname() || "/";

  return (
    <nav className={styles.nav} aria-label="Requester navigation">
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








