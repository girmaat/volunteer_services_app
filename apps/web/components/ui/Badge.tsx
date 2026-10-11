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
export function VerifiedBadge({ label = "Verified" }: { label?: string }) {
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
  draft: { label: "Draft", tone: "neutral" }
};

/** One colour per request/application state, used everywhere a status is shown. */
export function StatusPill({ status }: { status: string | null | undefined }) {
  const key = String(status || "").toLowerCase();
  const s = STATUS[key] ?? { label: key ? key[0].toUpperCase() + key.slice(1) : "Unknown", tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
