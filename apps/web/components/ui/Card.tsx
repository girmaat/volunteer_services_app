import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("rounded-md border border-line bg-surface p-5", className)} {...rest} />;
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? <div className="mb-2 text-sm text-muted">{back}</div> : null}
        <h1 className="m-0 text-2xl font-bold [overflow-wrap:anywhere]">{title}</h1>
        {description ? <p className="m-0 mt-1.5 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <p className="m-0 mx-auto font-display text-lg font-semibold">{title}</p>
      {body ? <p className="mx-auto mb-0 mt-2 max-w-prose text-muted">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning" | "danger"; children: ReactNode }) {
  const tones = {
    info: "border-primary bg-primary-tint text-ink",
    success: "border-success bg-success-tint text-ink",
    warning: "border-warning bg-warning-tint text-ink",
    danger: "border-danger bg-danger-tint text-ink"
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
