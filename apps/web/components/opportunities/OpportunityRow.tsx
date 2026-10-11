import Link from "next/link";
import { MapPin, Monitor, Shuffle, CalendarClock } from "lucide-react";
import { VerifiedBadge } from "../ui/Badge";

export type OpportunitySummary = {
  id: string;
  title: string;
  summary?: string | null;
  location?: string | null;
  mode?: string | null;
  tags?: string[] | null;
  needed_by?: string | null;
  organization_name?: string | null;
  organization_verified?: boolean;
};

export function modeText(mode?: string | null) {
  return mode === "in-person" ? "In person" : mode === "hybrid" ? "Hybrid" : "Remote";
}

function ModeIcon({ mode }: { mode?: string | null }) {
  const C = mode === "in-person" ? MapPin : mode === "hybrid" ? Shuffle : Monitor;
  return <C aria-hidden className="h-4 w-4 shrink-0" />;
}

export function formatNeededBy(d?: string | null) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** One opportunity in a list: the whole row is the link. */
export default function OpportunityRow({ o, href, compact }: { o: OpportunitySummary; href: string; compact?: boolean }) {
  const due = formatNeededBy(o.needed_by);
  const where = o.mode === "remote" ? "Remote" : o.location || modeText(o.mode);
  return (
    <li className="list-none">
      <Link
        href={href}
        className="group grid gap-1.5 border-b border-line px-1 py-4 text-ink no-underline hover:text-ink sm:grid-cols-[1fr_auto] sm:gap-6"
      >
        <div className="min-w-0">
          <h3 className="m-0 font-display text-base font-semibold leading-snug group-hover:text-primary group-hover:underline">{o.title}</h3>
          {!compact && o.summary ? <p className="m-0 mt-1 line-clamp-2 text-sm text-muted">{o.summary}</p> : null}
          <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ModeIcon mode={o.mode} />
              {where}
            </span>
            {o.organization_name ? (
              <span className="inline-flex items-center gap-1.5">
                {o.organization_name}
                {o.organization_verified ? <VerifiedBadge /> : null}
              </span>
            ) : (
              <span>Neighbor request</span>
            )}
          </p>
        </div>
        {due ? (
          <p className="m-0 inline-flex items-center gap-1.5 self-start whitespace-nowrap text-sm text-muted sm:pt-0.5">
            <CalendarClock aria-hidden className="h-4 w-4" /> By {due}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
