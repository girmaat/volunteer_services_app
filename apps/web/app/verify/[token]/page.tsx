import { API_BASE_URL_SERVER } from "@thankyou/config";
import { ShieldCheck, ShieldX } from "lucide-react";
import RecordView, { type Snapshot } from "../../../components/records/RecordView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Check a volunteer record", robots: { index: false, follow: false } };

type Result = { state: "valid" | "expired" | "revoked" | "replaced" | "corrected" | "not_found"; issuer?: string; issued_at?: string; expires_at?: string } & Partial<Snapshot>;

const MESSAGE: Record<Exclude<Result["state"], "valid">, { title: string; body: string }> = {
  expired: { title: "This record has expired", body: "The volunteer chose how long the link would work. Ask them for a new one." },
  revoked: { title: "This record was turned off", body: "The volunteer turned this link off. Ask them for a new one if you still need it." },
  replaced: { title: "This record was replaced", body: "There’s a newer version with updated hours. Ask the volunteer for the new link." },
  corrected: { title: "These hours were corrected", body: "An organizer changed hours on this record after it was issued, so it no longer counts. Ask the volunteer for an updated link." },
  not_found: { title: "We can’t find this record", body: "Check the link was copied in full." }
};

/** Public verification (REC-03, ID-07): who issued it, how each entry was approved, and whether it still counts. Nothing private unless it's valid. */
export default async function VerifyRecordPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/records/${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
  const data: Result = res ? await res.json().catch(() => ({ state: "not_found" })) : { state: "not_found" };
  const valid = data.state === "valid" && data.entries;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <p className={`m-0 flex items-center gap-2 text-sm font-semibold ${valid ? "text-success" : "text-danger"}`}>
        {valid ? <ShieldCheck aria-hidden className="h-5 w-5" /> : <ShieldX aria-hidden className="h-5 w-5" />}
        {valid ? "Valid record, issued by ThankYou" : "Not a valid record right now"}
      </p>
      {valid ? (
        <>
          <h1 className="m-0 mt-2 font-display text-3xl font-bold">Volunteer service record</h1>
          <p className="m-0 mt-2 text-muted">This is a copy of the record as it was issued. If any of these hours are corrected later, this page will say so.</p>
          <div className="mt-6">
            <RecordView s={data as Snapshot} issuedAt={data.issued_at} expiresAt={data.expires_at} />
          </div>
        </>
      ) : (
        <>
          <h1 className="m-0 mt-2 font-display text-3xl font-bold">{MESSAGE[data.state as Exclude<Result["state"], "valid">]?.title ?? MESSAGE.not_found.title}</h1>
          <p className="m-0 mt-2 text-lg text-muted">{MESSAGE[data.state as Exclude<Result["state"], "valid">]?.body ?? MESSAGE.not_found.body}</p>
        </>
      )}
    </main>
  );
}
