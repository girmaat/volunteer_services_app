import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";

const box =
  "h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus)] disabled:cursor-not-allowed";

type ChoiceProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode; hint?: ReactNode };

/** Checkbox with its label (the whole row is clickable). */
export function Checkbox({ label, hint, className, id, ...rest }: ChoiceProps) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-ink", className)} htmlFor={id}>
      <input type="checkbox" id={id} className={cn(box, "mt-0.5 rounded-sm")} {...rest} />
      <span>
        {label}
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Fieldset + legend so screen readers announce the group's question. */
export function RadioGroup({ legend, hint, children, className }: { legend: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("m-0 grid gap-2 border-0 p-0", className)}>
      <legend className="mb-1 p-0 text-sm font-semibold text-ink">{legend}</legend>
      {hint ? <p className="m-0 mb-1 text-xs text-muted">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/** Round avatar: the image when there is one, otherwise initials on a tinted circle. */
export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  const dim = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded images served from /media (already sized)
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={dim} />;
  }
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary-tint font-semibold text-primary", size < 32 ? "text-xs" : "text-sm", className)}
      style={dim}
    >
      {initials}
    </span>
  );
}

