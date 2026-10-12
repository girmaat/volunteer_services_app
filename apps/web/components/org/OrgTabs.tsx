import { LinkTabs } from "../ui";

/** The organization section: team, settings and reports share one place in the navigation. */
export default function OrgTabs() {
  return (
    <LinkTabs
      label="Organization"
      items={[
        { href: "/org/team", label: "Team" },
        { href: "/org/settings", label: "Settings" },
        { href: "/org/reports", label: "Reports" }
      ]}
    />
  );
}
