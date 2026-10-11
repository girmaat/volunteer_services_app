import Link from "next/link";
import styles from "../../volunteer.module.css";

type Props = { active: "summary" | "completed" | "impact" | "hours" | "tasks" | "outcomes" | "reviews" | "badges" };

const items: { key: Props["active"]; href: string; label: string }[] = [
  { key: "summary", href: "/volunteer/history", label: "Overview" },
  { key: "completed", href: "/volunteer/history/completed", label: "Completed" },
  { key: "impact", href: "/volunteer/history/impact", label: "Impact log" },
  { key: "hours", href: "/volunteer/history/hours", label: "Hours" },
  { key: "tasks", href: "/volunteer/history/tasks", label: "Tasks" },
  { key: "outcomes", href: "/volunteer/history/outcomes", label: "Outcomes" },
  { key: "reviews", href: "/volunteer/history/reviews", label: "Reviews" },
  { key: "badges", href: "/volunteer/history/badges", label: "Badges" }
];

export default function HistoryTabs({ active }: Props) {
  return (
    <div className={styles.subnav}>
      {items.map((it) => (
        <Link prefetch={false}
          key={it.key}
          href={it.href}
          className={`${styles.subnavLink} ${active === it.key ? styles.subnavLinkActive : ""}`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}


