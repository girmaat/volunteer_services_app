import { BadgeCheck, ShieldAlert } from "lucide-react";

export type RecordEntry = {
  date: string;
  activity: string;
  organization: string;
  organization_verified: boolean;
  hours: number | null;
  units: number | null;
  unit: string | null;
  approved_by: string;
  approved_at: string | null;
  verification: string;
  corrected: boolean;
};
export type Snapshot = { volunteer_name: string; name_kind: "display" | "legal"; entries: RecordEntry[]; totals: { hours: number; units: { unit: string; amount: number }[] }; statement: string };

const d = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The record exactly as a recipient sees it: used for the volunteer's preview and the public page. */
export default function RecordView({ s, issuedAt, expiresAt }: { s: Snapshot; issuedAt?: string; expiresAt?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">Volunteer service record</p>
        <p className="m-0 mt-1 font-display text-2xl font-bold">{s.volunteer_name}</p>
        <p className="m-0 mt-1 text-sm text-muted">
          {s.totals.hours} approved hours{s.totals.units.map((u) => ` · ${u.amount} ${u.unit}`).join("")}
          {issuedAt ? ` · Issued ${new Date(issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
          {expiresAt ? ` · Valid until ${new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
        </p>
      </div>
      {/* Phones: one block per entry. */}
      <ul className="m-0 p-0 sm:hidden">
        {s.entries.map((e, i) => (
          <li key={i} className="list-none border-b border-line px-5 py-3 text-sm last:border-b-0">
            <p className="m-0 flex justify-between gap-3">
              <span className="font-medium">{e.activity}</span>
              <span className="whitespace-nowrap">
                {e.hours != null ? `${e.hours} h` : ""}
                {e.units != null ? `${e.hours != null ? " · " : ""}${e.units} ${e.unit}` : ""}
              </span>
            </p>
            <p className="m-0 mt-0.5 text-muted">
              {d(e.date)} · {e.organization}
              {e.organization_verified ? " (verified)" : ""}
              {e.corrected ? " · corrected" : ""}
            </p>
            <p className="m-0 mt-0.5 text-xs text-muted">
              {e.approved_by} · {e.verification}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th scope="col" className="px-5 py-2 font-semibold">Date</th>
              <th scope="col" className="px-3 py-2 font-semibold">Service</th>
              <th scope="col" className="px-3 py-2 font-semibold">Amount</th>
              <th scope="col" className="px-5 py-2 font-semibold">Approved by and how</th>
            </tr>
          </thead>
          <tbody>
            {s.entries.map((e, i) => (
              <tr key={i} className="border-b border-line align-top last:border-b-0">
                <td className="whitespace-nowrap px-5 py-3">{d(e.date)}</td>
                <td className="px-3 py-3">
                  <span className="block font-medium">{e.activity}</span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-muted">
                    {e.organization}
                    {e.organization_verified ? <BadgeCheck aria-label="Verified organization" className="h-3.5 w-3.5 text-[#b07d00]" /> : null}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {e.hours != null ? `${e.hours} h` : ""}
                  {e.units != null ? `${e.hours != null ? " · " : ""}${e.units} ${e.unit}` : ""}
                  {e.corrected ? <span className="block text-xs text-muted">corrected</span> : null}
                </td>
                <td className="px-5 py-3 text-muted">
                  {e.approved_by}
                  <span className="block text-xs">{e.verification}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 flex gap-2 border-t border-line px-5 py-3 text-xs text-muted">
        <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        {s.statement}
      </p>
    </div>
  );
}
