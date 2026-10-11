import Link from "next/link";
import { MapPin, Monitor, Shuffle, CalendarClock, Sparkles, AlertCircle } from "lucide-react";
import { VerifiedBadge } from "../ui/Badge";
import { describeRrule, formatInZone } from "../../lib/time";

export type OpportunitySummary = {
  id: string;
  title: string;
  summary?: string | null;
  location?: string | null;
  public_area?: string | null;
  mode?: string | null;
  tags?: string[] | null;
  needed_by?: string | null;
  starts_at?: string | null;
  schedule_type?: string | null;
  recurrence_rule?: string | null;
  timezone?: string | null;
  apply_by?: string | null;
  organization_name?: string | null;
  organization_verified?: boolean;
  posted_by?: string | null;
  category_label?: string | null;
  spots_left?: number;
  distance_miles?: number | null;
  match?: { score: number; reasons: string[]; warnings: string[] } | null;
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

/**
 * When it happens, in the viewer's time zone. For remote requests in another zone the
 * organizer's local time is in the tooltip ("their time").
 */
export function WhenText({ o, viewerTz }: { o: OpportunitySummary; viewerTz?: string | null }) {
  const reqTz = o.timezone || "America/New_York";
  const tz = viewerTz || reqTz;
  if (o.schedule_type === "flexible_window" || (!o.starts_at && !o.needed_by)) {
    return o.apply_by ? <>Flexible · by {formatInZone(o.apply_by, tz, { dateOnly: true })}</> : <>Flexible</>;
  }
  const iso = o.starts_at || o.needed_by || null;
  const mine = formatInZone(iso, tz, { withZone: viewerTz ? viewerTz !== reqTz : false });
  const theirs = viewerTz && viewerTz !== reqTz ? `Their time: ${formatInZone(iso, reqTz, { withZone: true })}` : undefined;
  return (
    <time dateTime={iso ?? undefined} title={theirs}>
      {o.schedule_type === "recurring" ? `${describeRrule(o.recurrence_rule)} · from ` : ""}
      {mine}
      {theirs ? <span className="sr-only"> ({theirs})</span> : null}
    </time>
  );
}

/** One opportunity in a list: the whole row is the link. Shows "why it matches" for signed-in volunteers. */
export default function OpportunityRow({ o, href, compact, viewerTz }: { o: OpportunitySummary; href: string; compact?: boolean; viewerTz?: string | null }) {
  const where = o.mode === "remote" ? "Remote" : o.public_area || o.location || modeText(o.mode);
  const by = o.organization_name || o.posted_by || null;
  return (
    <li className="list-none">
      <Link href={href} className="group grid gap-1.5 border-b border-line px-1 py-4 text-ink no-underline hover:text-ink sm:grid-cols-[1fr_auto] sm:gap-6">
        <div className="min-w-0">
          <h3 className="m-0 font-display text-base font-semibold leading-snug group-hover:text-primary group-hover:underline">{o.title}</h3>
          {!compact && o.summary ? <p className="m-0 mt-1 line-clamp-2 text-sm text-muted">{o.summary}</p> : null}
          <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ModeIcon mode={o.mode} />
              {where}
              {o.distance_miles != null ? ` · ${o.distance_miles} mi` : ""}
            </span>
            {by ? (
              <span className="inline-flex items-center gap-1.5">
                {by}
                {o.organization_verified ? <VerifiedBadge /> : null}
              </span>
            ) : (
              <span>Neighbor request</span>
            )}
            {o.category_label ? <span>{o.category_label}</span> : null}
          </p>
          {o.match && (o.match.reasons.length || o.match.warnings.length) ? (
            <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {o.match.reasons.length ? (
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <Sparkles aria-hidden className="h-3.5 w-3.5" />
                  <span>
                    <span className="sr-only">Why it matches: </span>
                    {o.match.reasons.join(" · ")}
                  </span>
                </span>
              ) : null}
              {o.match.warnings.map((w) => (
                <span key={w} className="inline-flex items-center gap-1 text-warning">
                  <AlertCircle aria-hidden className="h-3.5 w-3.5" /> {w}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <div className="grid content-start justify-items-start gap-1 text-sm text-muted sm:justify-items-end sm:pt-0.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <CalendarClock aria-hidden className="h-4 w-4" /> <WhenText o={o} viewerTz={viewerTz} />
          </span>
          {typeof o.spots_left === "number" ? <span className="whitespace-nowrap">{o.spots_left === 0 ? "Full · waitlist" : `${o.spots_left} spot${o.spots_left === 1 ? "" : "s"} left`}</span> : null}
        </div>
      </Link>
    </li>
  );
}
