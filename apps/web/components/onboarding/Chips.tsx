import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ChipOption = { value: string; label: string; hint?: string };

/**
 * A group of toggle chips backed by real checkboxes (or radios), so it works without JavaScript,
 * is announced as a group, and sends every selected value under one name.
 */
export function ChipGroup({
  name,
  legend,
  hint,
  options,
  selected = [],
  type = "checkbox",
  required
}: {
  name: string;
  legend: ReactNode;
  hint?: ReactNode;
  options: ChipOption[];
  selected?: string[];
  type?: "checkbox" | "radio";
  required?: boolean;
}) {
  const chosen = new Set(selected.map((s) => s.toLowerCase()));
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 p-0 text-base font-semibold text-ink">{legend}</legend>
      {hint ? <p className="m-0 -mt-1 mb-1 text-sm text-muted">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            title={o.hint}
            className={cn(
              "group inline-flex min-h-[44px] cursor-pointer select-none items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-medium text-ink",
              "hover:border-ink has-[:checked]:border-primary has-[:checked]:bg-primary-tint has-[:checked]:text-primary",
              "has-[:focus-visible]:shadow-[var(--focus)]"
            )}
          >
            <input
              type={type}
              name={name}
              value={o.value}
              defaultChecked={chosen.has(o.value.toLowerCase())}
              required={required && type === "radio"}
              className="sr-only"
            />
            <span aria-hidden className="hidden text-primary group-has-[:checked]:inline">✓</span>
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Numbered progress for the onboarding steps. */
export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav aria-label="Setup progress" className="mb-8">
      <p className="m-0 mb-2 text-sm font-medium text-muted">
        Step {current + 1} of {steps.length}
        <span className="sr-only">: {steps[current]}</span>
      </p>
      <ol className="m-0 flex list-none gap-1.5 p-0">
        {steps.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === current ? "step" : undefined}>
            <span aria-hidden className={cn("block h-1.5 rounded-full", i <= current ? "bg-primary" : "bg-line")} />
            <span className={cn("mt-1.5 hidden text-xs sm:block", i === current ? "font-semibold text-ink" : "text-muted")}>{s}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
