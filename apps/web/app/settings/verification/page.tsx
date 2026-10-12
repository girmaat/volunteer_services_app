import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { Button, Card, Notice } from "../../../components/ui";

export const dynamic = "force-dynamic";

const STATE: Record<string, { tone: "info" | "success" | "warning" | "danger"; text: string }> = {
  approved: { tone: "success", text: "You're verified. You can help in categories that need a verified volunteer." },
  submitted: { tone: "info", text: "Your document is with our team. We'll let you know when it's reviewed (usually within two business days)." },
  rejected: { tone: "warning", text: "We couldn't verify the last document. Upload a clearer photo or a different ID." },
  required: { tone: "info", text: "Upload an ID to finish verification." }
};

async function uploadAction(fd: FormData) {
  "use server";
  const file = fd.get("document");
  if (!(file instanceof File) || !file.size) redirect("/settings/verification?error=" + encodeURIComponent("Choose a file to upload."));
  const out = new FormData();
  out.set("document", file, file.name);
  const r = await backendFetch("/v1/onboarding/verification", { method: "POST", body: out });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    redirect("/settings/verification?error=" + encodeURIComponent(j?.message || "Upload failed. Try again."));
  }
  redirect("/settings/verification?sent=1");
}

/** Settings → Verification: ask to be verified with an ID document (reviewed by platform staff). */
export default async function Page(props: { searchParams?: Promise<{ sent?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser();
  if (!me) redirect("/login?returnTo=/settings/verification");
  const status = String(me.verification_status || "not_required");
  const state = STATE[status];
  return (
    <div className="grid max-w-2xl gap-6">
      {sp.sent ? <Notice tone="success">Thanks. Your document was sent for review.</Notice> : null}
      {sp.error ? <Notice tone="danger">{sp.error}</Notice> : null}
      <Card className="grid gap-4">
        <div>
          <h2 className="m-0 text-lg">Verification</h2>
          <p className="m-0 mt-1 text-sm text-muted">
            Some requests (for example, helping older adults at home) are open only to verified volunteers. Verification means our team checked a government ID matches your name. The ID is
            seen only by platform staff and is never shown to anyone you help.
          </p>
        </div>
        {state ? <Notice tone={state.tone}>{state.text}</Notice> : null}
        {status !== "approved" && status !== "submitted" ? (
          <form action={uploadAction} className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-semibold">
              Photo or scan of a government ID
              <span className="font-normal text-muted">PDF, JPG or PNG, up to 10 MB. Cover your ID number if you like; we need your name and photo.</span>
              <input name="document" type="file" accept="application/pdf,image/jpeg,image/png" required className="text-sm font-normal" />
            </label>
            <div>
              <Button type="submit">Send for review</Button>
            </div>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
