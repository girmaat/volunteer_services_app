import { LinkTabs } from "../ui";

/** The organization section: team, settings and reports share one place in the navigation. */
export default function OrgTabs({ role }: { role?: string }) {
  return (
    <LinkTabs
      label="Organization"
      items={[
        { href: "/org/team", label: "Team" },
        { href: "/org/settings", label: "Settings" },
        // Reports name volunteers and their hours: admins and managers only.
        ...(role === "member" ? [] : [{ href: "/org/reports", label: "Reports" }])
      ]}
    />
  );
}
