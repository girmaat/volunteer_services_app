import Link from "next/link";
import { backendFetch } from "../lib/backend";
import { StatStrip } from "../../components/ui";

type Metrics = {
  posted_30d: number;
  filled_30d: number;
  fill_rate_30d: number | null;
  live_now: number;
  awaiting_review: number;
  held_messages: number;
  open_disputes: number;
  median_hours_to_first_applicant: number | null;
  weekly: { week: string; posted: number; filled: number }[];
};

const wk = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Post volume and fill rate (4.9). One series per chart; fills per week are in the tooltip and the table. */
export default async function MetricsPanel() {
  const r = await backendFetch("/v1/admin/metrics");
  if (!r.ok) return null;
  const m = (await r.json()) as Metrics;
  const max = Math.max(1, ...m.weekly.map((w) => w.posted));
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <section aria-labelledby="metrics-h" className="mb-8 grid gap-5">
      <h2 id="metrics-h" className="m-0 text-lg">
        Marketplace health
      </h2>
      <StatStrip
        stats={[
          { label: "Posted (30 days)", value: m.posted_30d },
          { label: "Fill rate (30 days)", value: m.fill_rate_30d == null ? "—" : `${m.fill_rate_30d}%`, hint: `${m.filled_30d} filled` },
          { label: "Time to first applicant", value: m.median_hours_to_first_applicant == null ? "—" : `${Math.round(m.median_hours_to_first_applicant)} h`, hint: "median" },
          { label: "Awaiting review", value: m.awaiting_review, href: "/admin/moderation?tab=review", attention: m.awaiting_review > 0 },
          { label: "Held messages", value: m.held_messages, href: "/admin/moderation?tab=messages", attention: m.held_messages > 0 },
          { label: "Open disputes", value: m.open_disputes, href: "/admin/moderation?tab=disputes", attention: m.open_disputes > 0 }
        ]}
      />
      <figure className="m-0 rounded-md border border-line bg-surface p-5">
        <figcaption className="mb-4">
          <span className="font-medium">Requests posted per week</span>
          <span className="block text-sm text-muted">Last 12 weeks. Hover a bar for how many filled.</span>
        </figcaption>
        <div className="grid grid-cols-[2.5rem_1fr] gap-2">
          <div aria-hidden className="relative h-40 text-right text-xs text-muted">
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
                {t}
              </span>
            ))}
          </div>
          <div className="relative h-40">
            {ticks.map((t) => (
              <div key={t} aria-hidden className="absolute inset-x-0 h-px bg-line" style={{ top: `${100 - (t / max) * 100}%` }} />
            ))}
            <ol className="absolute inset-0 m-0 flex list-none items-end justify-between gap-0.5 p-0" aria-label="Requests posted per week">
              {m.weekly.map((w) => (
                <li key={w.week} className="group relative flex h-full flex-1 items-end justify-center" title={`Week of ${wk(w.week)}: ${w.posted} posted, ${w.filled} filled`}>
                  <span className="sr-only">
                    Week of {wk(w.week)}: {w.posted} posted, {w.filled} filled
                  </span>
                  <span aria-hidden className="block w-full max-w-[24px] rounded-t-[4px] bg-primary group-hover:opacity-80" style={{ height: `${(w.posted / max) * 100}%`, minHeight: w.posted ? 2 : 0 }} />
                </li>
              ))}
            </ol>
          </div>
          <div />
          <div aria-hidden className="flex justify-between text-xs text-muted">
            <span>{wk(m.weekly[0]?.week ?? "")}</span>
            <span>{wk(m.weekly.at(-1)?.week ?? "")}</span>
          </div>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Show as a table</summary>
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-1 font-medium">Week of</th>
                <th scope="col" className="py-1 text-right font-medium">Posted</th>
                <th scope="col" className="py-1 text-right font-medium">Filled</th>
              </tr>
            </thead>
            <tbody>
              {m.weekly.map((w) => (
                <tr key={w.week} className="border-b border-line">
                  <td className="py-1">{wk(w.week)}</td>
                  <td className="py-1 text-right">{w.posted}</td>
                  <td className="py-1 text-right">{w.filled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>
      <p className="m-0 text-sm">
        <Link prefetch={false} href="/admin/moderation" className="font-medium text-primary">
          Open moderation queues →
        </Link>
      </p>
    </section>
  );
}
