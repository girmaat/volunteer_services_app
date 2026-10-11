
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../../volunteer.module.css";

type Tab = { href: string; label: string };

const tabs: Tab[] = [
  { href: "/volunteer/opportunities/recommended", label: "Recommended" },
  { href: "/volunteer/opportunities/nearby", label: "Nearby" },
  { href: "/volunteer/opportunities/remote", label: "Remote" },
  { href: "/volunteer/opportunities/saved", label: "Saved" }
];

export default function OpportunityTabs() {
  const pathname = usePathname() || "/";

  return (
    <nav className={styles.nav} aria-label="Opportunity lists">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} className={`${styles.navLink} ${active ? styles.navActive : ""}`.trim()}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
