import { LinkTabs, Notice } from "../ui";

/**
 * "As volunteer · As requester" tabs on the profile, shown when the account holds both roles.
 * `setup` shows the welcome note after a role was just added.
 */
export default function ProfileTabs({ roles, setup, role }: { roles: string[]; setup?: boolean; role: "volunteer" | "requester" }) {
  const both = roles.includes("volunteer") && roles.includes("requester");
  return (
    <>
      {setup ? (
        <div className="mb-5">
          <Notice tone="success">
            {role === "volunteer"
              ? "Volunteer role added. Add your skills, availability and how far you can travel so we can match you."
              : "Requester role added. Tell volunteers what kinds of help you usually need and anything they should know."}
          </Notice>
        </div>
      ) : null}
      {both ? (
        <LinkTabs
          label="Profile"
          items={[
            { href: "/volunteer/profile", label: "As volunteer" },
            { href: "/requester/profile", label: "As requester" }
          ]}
        />
      ) : null}
    </>
  );
}
