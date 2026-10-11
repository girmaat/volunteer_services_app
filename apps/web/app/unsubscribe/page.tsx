import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import { Button, Card, Notice } from "../../components/ui";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

async function confirm(fd: FormData) {
  "use server";
  const token = String(fd.get("token") || "");
  const r = await fetch(`${API_BASE_URL_SERVER}/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST", cache: "no-store" });
  redirect(`/unsubscribe?token=${encodeURIComponent(token)}&done=${r.ok ? "1" : "0"}`);
}

/** Landing page for the unsubscribe link in email footers (no login needed). */
export default async function Page(props: { searchParams?: Promise<{ token?: string; done?: string }> }) {
  const sp = (await props.searchParams) || {};
  const token = sp.token || "";
  const r = token ? await fetch(`${API_BASE_URL_SERVER}/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null) : null;
  const info = r && r.ok ? ((await r.json()) as { label: string }) : null;
  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="m-0 text-2xl">Email preferences</h1>
      {!info ? (
        <div className="mt-4">
          <Notice tone="danger">This unsubscribe link isn&apos;t valid. You can change every email setting in Settings → Notifications.</Notice>
        </div>
      ) : sp.done === "1" ? (
        <div className="mt-4">
          <Notice tone="success">You won&apos;t get emails for “{info.label}” any more. In-app notifications are unchanged.</Notice>
        </div>
      ) : (
        <Card className="mt-4 grid gap-3">
          <p className="m-0">
            Stop emails for <strong>{info.label}</strong>?
          </p>
          <form action={confirm}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit">Unsubscribe</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
