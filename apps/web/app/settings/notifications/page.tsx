import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { backendFetch } from "../../lib/backend";
import { Button, Notice } from "../../../components/ui";

export const dynamic = "force-dynamic";

type Pref = { type: string; label: string; email: boolean; in_app: boolean };


async function savePreferences(fd: FormData) {
  "use server";
  const types = fd.getAll("types").map(String);
  const preferences = types.map((type) => ({ type, email: fd.get(`email:${type}`) === "on", in_app: fd.get(`app:${type}`) === "on" }));
  const r = await backendFetch("/v1/notifications/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ preferences }) });
  redirect(`/settings/notifications?${r.ok ? "saved=1" : "error=1"}#preferences`);
}

export default async function Page(props: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const p = await backendFetch("/v1/notifications/preferences");
  const prefs = p.ok ? ((await p.json()) as { preferences: Pref[] }).preferences : [];

  return (
    <div className="grid gap-10">
      <p className="m-0 text-sm text-muted">
        Your notifications are on{" "}
        <Link prefetch={false} href="/notifications" className="font-medium text-primary">
          the Notifications page
        </Link>{" "}
        (and under the bell). Here you choose what we email you.
      </p>

      <section id="preferences" aria-labelledby="prefs-h">
        <h2 id="prefs-h" className="m-0 text-lg">
          What we send you
        </h2>
        <p className="m-0 mt-1 text-sm text-muted">Account and security emails (sign-in links, password resets) are always sent.</p>
        {sp.saved ? (
          <div className="mt-3">
            <Notice tone="success">Preferences saved.</Notice>
          </div>
        ) : null}
        {sp.error ? (
          <div className="mt-3">
            <Notice tone="danger">Preferences couldn&apos;t be saved.</Notice>
          </div>
        ) : null}
        <form action={savePreferences} className="mt-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Notification
                </th>
                <th scope="col" className="w-20 py-2 text-center font-medium">
                  Email
                </th>
                <th scope="col" className="w-20 py-2 text-center font-medium">
                  In app
                </th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((x) => (
                <tr key={x.type} className="border-b border-line">
                  <th scope="row" className="py-3 pr-3 text-left font-normal">
                    <input type="hidden" name="types" value={x.type} />
                    {x.label}
                  </th>
                  <td className="text-center">
                    <input type="checkbox" name={`email:${x.type}`} defaultChecked={x.email} aria-label={`Email: ${x.label}`} className="h-4 w-4 accent-[var(--primary)]" />
                  </td>
                  <td className="text-center">
                    <input type="checkbox" name={`app:${x.type}`} defaultChecked={x.in_app} aria-label={`In app: ${x.label}`} className="h-4 w-4 accent-[var(--primary)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4">
            <Button type="submit">Save preferences</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
