import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { Button, Card, Notice } from "../../../components/ui";
import { formatInZone, zoneOr } from "../../../lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check in", robots: { index: false, follow: false } };

type State = {
  request: { id: string; title: string; org_name: string | null; starts_at: string | null; timezone: string | null; public_area: string | null };
  application: { id: string; status: string } | null;
  checked_in_at: string | null;
  prerequisites: { status: string; items: { label: string; state: string }[] };
  window: { ok: boolean; message?: string };
};

async function act(token: string, action: "in" | "out") {
  "use server";
  const r = await backendFetch(`/v1/checkin/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
  const body = (await r.json().catch(() => null)) as { message?: string } | null;
  redirect(`/check-in/${encodeURIComponent(token)}?${r.ok ? `done=${action}` : `error=${encodeURIComponent(body?.message || "That didn’t go through.")}`}`);
}

/** Scanned from the code staff show on site: the volunteer checks in or out on their own phone (CON-04). */
export default async function CheckInPage(props: { params: Promise<{ token: string }>; searchParams?: Promise<{ error?: string; done?: string }> }) {
  const { token } = await props.params;
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser();
  if (!me) redirect(`/login?returnTo=${encodeURIComponent(`/check-in/${token}`)}`);
  const res = await backendFetch(`/v1/checkin/${encodeURIComponent(token)}`);
  const s = res.ok ? ((await res.json()) as State) : null;
  const msg = !res.ok ? (((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? "This check-in code isn’t valid.") : null;

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="m-0 font-display text-3xl font-bold">Check in</h1>
      {!s ? (
        <p className="m-0 mt-3 text-lg text-muted">{msg}</p>
      ) : (
        <>
          <p className="m-0 mt-2 text-lg">
            {s.request.title}
            <span className="block text-base text-muted">
              {s.request.org_name}
              {s.request.starts_at ? ` · ${formatInZone(s.request.starts_at, zoneOr(s.request.timezone))}` : ""}
            </span>
          </p>
          {sp.done === "out" ? (
            <div className="mt-5">
              <Notice tone="success">Checked out. Your hours went to the organizer for approval. Thank you!</Notice>
            </div>
          ) : null}
          {sp.error ? (
            <div className="mt-5">
              <Notice tone="danger">{sp.error}</Notice>
            </div>
          ) : null}
          <Card className="mt-5 grid gap-4 p-5">
            {!s.application || !["accepted", "confirmed", "completed"].includes(s.application.status) ? (
              <p className="m-0">You aren’t signed up for this shift. Talk to the organizer on site.</p>
            ) : s.checked_in_at ? (
              <>
                <p className="m-0 flex items-center gap-2 text-lg font-semibold text-success">
                  <CheckCircle2 aria-hidden className="h-6 w-6" /> Checked in at {new Date(s.checked_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: zoneOr(s.request.timezone) })}
                </p>
                <form action={act.bind(null, token, "out")}>
                  <Button type="submit" size="lg" className="w-full" icon={<LogOut aria-hidden className="h-5 w-5" />}>
                    Check out
                  </Button>
                </form>
              </>
            ) : s.prerequisites.status !== "cleared" ? (
              <>
                <p className="m-0 font-medium">Finish these first:</p>
                <ul className="m-0 grid gap-1 pl-5">
                  {s.prerequisites.items.filter((i) => i.state !== "done").map((i) => (
                    <li key={i.label}>{i.label}</li>
                  ))}
                </ul>
                <Link href={`/volunteer/applications/${s.application.id}#prerequisites`} className="font-medium text-primary underline">
                  Open your application to finish them
                </Link>
              </>
            ) : !s.window.ok ? (
              <p className="m-0">{s.window.message}</p>
            ) : (
              <form action={act.bind(null, token, "in")}>
                <Button type="submit" size="lg" className="w-full" icon={<LogIn aria-hidden className="h-5 w-5" />}>
                  Check in now
                </Button>
              </form>
            )}
          </Card>
          <p className="m-0 mt-4 text-sm text-muted">Signed in as {me?.email}. Check-in never uses your location.</p>
        </>
      )}
    </main>
  );
}
