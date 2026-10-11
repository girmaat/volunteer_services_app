import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { Button, ButtonLink, Card, Notice } from "../../../components/ui";

export const dynamic = "force-dynamic";

const msg = async (r: Response) => ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn't go through.";

async function changePasswordAction(fd: FormData) {
  "use server";
  const currentPassword = String(fd.get("currentPassword") || "");
  const newPassword = String(fd.get("newPassword") || "");
  const confirmPassword = String(fd.get("confirmPassword") || "");
  if (newPassword.length < 8) redirect("/settings/account?error=" + encodeURIComponent("The new password needs at least 8 characters."));
  if (newPassword !== confirmPassword) redirect("/settings/account?error=" + encodeURIComponent("The new passwords don't match."));
  const r = await backendFetch("/v1/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
  redirect(r.ok ? "/settings/account?ok=password" : "/settings/account?error=" + encodeURIComponent(await msg(r)));
}

async function deleteAccountAction(fd: FormData) {
  "use server";
  const r = await backendFetch("/v1/me/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: String(fd.get("password") || ""), confirm: String(fd.get("confirm") || "") })
  });
  if (!r.ok) redirect("/settings/account?error=" + encodeURIComponent(await msg(r)) + "#delete");
  (await cookies()).set("ty_session", "", { path: "/", maxAge: 0 });
  redirect("/?deleted=1");
}

export default async function AccountPage(props: { searchParams?: Promise<{ ok?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const user = await getCurrentUser();
  const input = "h-11 w-full rounded border border-line-strong bg-surface px-3";
  return (
    <div className="grid max-w-2xl gap-6">
      {sp.ok === "password" ? <Notice tone="success">Password updated. Your other sessions were signed out.</Notice> : null}
      {sp.error ? <Notice tone="danger">{sp.error}</Notice> : null}

      <Card className="grid gap-4">
        <div>
          <h2 className="m-0 text-lg">Password</h2>
          <p className="m-0 mt-1 text-sm text-muted">Signed in as {user?.email}. Changing your password signs you out everywhere else.</p>
        </div>
        <form action={changePasswordAction} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Current password
            <input name="currentPassword" type="password" autoComplete="current-password" required className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            New password
            <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Confirm new password
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className={input} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit">Update password</Button>
            <Link href="/forgot-password" className="text-sm text-primary">
              Forgot it?
            </Link>
          </div>
        </form>
      </Card>

      <Card className="grid gap-3">
        <h2 className="m-0 text-lg">Your data</h2>
        <p className="m-0 text-sm text-muted">Download a copy of everything we hold about you: profile, requests, applications, messages, reviews and settings.</p>
        <div>
          <ButtonLink href="/api/download?what=my-data" variant="secondary" prefetch={false}>
            Download my data (JSON)
          </ButtonLink>
        </div>
      </Card>

      <Card id="delete" className="grid gap-3 border-danger">
        <h2 className="m-0 text-lg">Delete account</h2>
        <p className="m-0 text-sm text-muted">
          Your open requests are canceled, applications withdrawn, and your profile and contact details erased. Messages and reviews others received stay, shown as
          &ldquo;Deleted member&rdquo;. This can&apos;t be undone.
        </p>
        <form action={deleteAccountAction} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Password
            <input name="password" type="password" autoComplete="current-password" required className={input} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Type DELETE to confirm
            <input name="confirm" required pattern="DELETE" autoComplete="off" className={input} />
          </label>
          <div>
            <Button type="submit" variant="danger">
              Delete my account
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
