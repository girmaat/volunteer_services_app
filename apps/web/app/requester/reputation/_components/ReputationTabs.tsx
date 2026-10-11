import Link from "next/link";
import styles from "../../requester.module.css";

type Props = { active: "overview" | "received" | "given" };

const items: { key: Props["active"]; href: string; label: string }[] = [
  { key: "overview", href: "/requester/reputation", label: "Overview" },
  { key: "received", href: "/requester/reputation/reviews", label: "Reviews received" },
  { key: "given", href: "/requester/reputation/reviews-given", label: "Reviews given" }
];

export default function ReputationTabs({ active }: Props) {
  return (
    <nav className={styles.subnav}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={item.key === active ? styles.subnavLinkActive : styles.subnavLink}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
