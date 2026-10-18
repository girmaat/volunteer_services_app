import type { ReactNode } from "react";
import { BadgeCheck } from "lucide-react";
import { cn } from "../../lib/cn";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-[var(--muted-bg)] text-ink",
  primary: "bg-primary-tint text-primary",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger"
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

/** The one place sunflower appears in content: a verified seal. */
export function VerifiedBadge({ label = "Verified", prominent }: { label?: string; prominent?: boolean }) {
  if (prominent) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#b07d00] bg-sun px-3 py-1 text-sm font-bold text-ink shadow-sm" title="This organization completed Volunteer Services' verification review">
        <BadgeCheck aria-hidden className="h-4 w-4 text-[#7a5600]" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sun-tint px-2.5 py-0.5 text-xs font-semibold text-ink">
      <BadgeCheck aria-hidden className="h-3.5 w-3.5 text-[#b07d00]" />
      {label}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "primary" },
  paused: { label: "Paused", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  waitlisted: { label: "Waitlisted", tone: "warning" },
  rejected: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "success" },
  completed: { label: "Completed", tone: "primary" },
  canceled: { label: "Canceled", tone: "danger" },
  cancelled: { label: "Canceled", tone: "danger" },
  scheduled: { label: "Scheduled", tone: "primary" },
  filled: { label: "Filled", tone: "success" },
  draft: { label: "Draft", tone: "neutral" },
  in_review: { label: "In review", tone: "warning" },
  "no-show": { label: "No-show", tone: "danger" },
  pending_review: { label: "In review", tone: "warning" },
  offered: { label: "Spot offered", tone: "primary" },
  awaiting_owner: { label: "Waiting for owner", tone: "warning" },
  sent_back: { label: "Sent back", tone: "warning" },
  offer_expired: { label: "Offer expired", tone: "neutral" }
};

/** Hours (contributions): approved, waiting and self-reported never look alike (REC-01). */
const HOURS_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  adjusted: { label: "Approved with a change", tone: "success" },
  rejected: { label: "Not approved", tone: "danger" },
  revision_requested: { label: "Sent back to you", tone: "warning" },
  disputed: { label: "Disputed", tone: "warning" },
  unverified: { label: "Couldn’t be verified", tone: "neutral" },
  self_reported: { label: "Self-reported", tone: "neutral" }
};

/** One colour per request/application state, used everywhere a status is shown. */
const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Partly filled", tone: "primary" },
  filled: { label: "Filled", tone: "success" },
  paused: { label: "Paused", tone: "warning" }
};

export function StatusPill({ status, kind = "application" }: { status: string | null | undefined; kind?: "request" | "application" | "hours" }) {
  const key = String(status || "").toLowerCase();
  const s = (kind === "request" ? REQUEST_STATUS[key] : kind === "hours" ? HOURS_STATUS[key] : undefined) ?? STATUS[key] ?? { label: key ? key[0].toUpperCase() + key.slice(1) : "Unknown", tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
