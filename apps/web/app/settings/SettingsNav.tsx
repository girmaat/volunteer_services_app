"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./settings.module.css";

type Tab = { href: string; label: string; key: "overview" | "account" | "verification" | "roles" | "notifications" | "privacy" | "blocked" | "reports" };

export function SettingsNav() {
  const pathname = usePathname();
  const [unseen, setUnseen] = useState<number>(0);

  const tabs: Tab[] = useMemo(
    () => [
      { href: "/settings", label: "Overview", key: "overview" },
      { href: "/settings/account", label: "Account", key: "account" },
      { href: "/settings/verification", label: "Verification", key: "verification" },
      { href: "/settings/roles", label: "Roles", key: "roles" },
      { href: "/settings/notifications", label: "Notifications", key: "notifications" },
      { href: "/settings/privacy-safety", label: "Privacy & Safety", key: "privacy" },
      { href: "/settings/blocked-users", label: "Blocked users", key: "blocked" },
      { href: "/settings/reports", label: "Reports filed", key: "reports" }
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/settings/notifications/unseen-count", { method: "GET", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as any;
        const c = Number(data?.unseen_count ?? 0);
        if (!cancelled) setUnseen(Number.isFinite(c) ? c : 0);
      } catch {
        // ignore
      }
    }

    load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <nav className={styles.nav} aria-label="Settings">
      {tabs.map((t) => {
        const active = pathname === t.href || (t.href !== "/settings" && pathname.startsWith(t.href + "/"));
        const showBadge = t.key === "notifications" && unseen > 0;
        const badgeText = unseen > 99 ? "99+" : String(unseen);

        return (
          <Link prefetch={false} key={t.href} href={t.href} className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}>
            <span className={styles.navLinkInner}>
              <span>{t.label}</span>
              {showBadge ? <span className={styles.navBadge}>{badgeText}</span> : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}




