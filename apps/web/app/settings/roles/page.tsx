import { getCurrentUser } from "../../lib/backend";
import { Button, Card, Notice } from "../../../components/ui";

export const dynamic = "force-dynamic";

const ROLES = [
  {
    role: "volunteer" as const,
    title: "Volunteer",
    body: "Find opportunities near you or online, apply, track your hours and reviews.",
    home: "/volunteer/dashboard",
    profile: "/volunteer/profile"
  },
  {
    role: "requester" as const,
    title: "Request help",
    body: "Post what you need, review volunteers who apply and coordinate in one place.",
    home: "/requester/dashboard",
    profile: "/requester/profile"
  }
];

export default async function RolesPage(props: { searchParams?: Promise<{ error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const user = await getCurrentUser();
  const roles = user?.roles ?? [];
  const orgs = user?.orgs ?? [];

  return (
    <section aria-labelledby="roles-h">
      <h2 id="roles-h" className="m-0 text-lg">Roles</h2>
      <p className="m-0 mt-1 max-w-[60ch] text-muted">
        One account can volunteer and ask for help. Switch between them with the switcher at the top right of the page.
      </p>
      {sp.error ? (
        <div className="mt-4">
          <Notice tone="danger">That role couldn&apos;t be added. Try again.</Notice>
        </div>
      ) : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {ROLES.map((r) => {
          const has = roles.includes(r.role);
          return (
            <Card key={r.role} className="p-5">
              <h3 className="m-0 text-base">{r.title}</h3>
              <p className="m-0 mt-1 text-sm text-muted">{r.body}</p>
              <div className="mt-4">
                {has ? (
                  <form action="/api/context" method="post" className="flex items-center gap-3">
                    <input type="hidden" name="context" value={r.role} />
                    <span className="text-sm font-medium text-success">Active on your account</span>
                    <Button type="submit" size="sm" variant="secondary">
                      Use this role
                    </Button>
                  </form>
                ) : (
                  <form action="/api/roles" method="post">
                    <input type="hidden" name="role" value={r.role} />
                    <Button type="submit" size="sm">
                      Add {r.title.toLowerCase()} role
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {orgs.length ? (
        <div className="mt-8">
          <h3 className="m-0 text-base">Organizations</h3>
          <ul className="m-0 mt-2 border-t border-line p-0">
            {orgs.map((o) => (
              <li key={o.slug} className="flex list-none items-center justify-between gap-3 border-b border-line py-3">
                <span>
                  <span className="font-medium">{o.name}</span> <span className="text-sm text-muted">· {o.role}</span>
                </span>
                <form action="/api/context" method="post">
                  <input type="hidden" name="context" value={`org:${o.slug}`} />
                  <Button type="submit" size="sm" variant="ghost">
                    Open
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
