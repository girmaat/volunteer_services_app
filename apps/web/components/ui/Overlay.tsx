"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type OverlayProps = {
  /** The element that opens it (a Button). */
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const overlay = "fixed inset-0 z-50 bg-[rgba(23,36,47,0.45)] data-[state=open]:animate-in";
const close =
  "absolute right-3 top-3 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-muted hover:bg-wash hover:text-ink";

/** Centered dialog. Radix handles focus trap, Escape, and returning focus to the trigger. */
export function Modal({ trigger, title, description, children, open, onOpenChange }: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-surface p-6 shadow-pop focus:outline-none">
          <Dialog.Title className="m-0 pr-10 font-display text-lg font-semibold text-ink">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mb-0 mt-1.5 text-sm text-muted">{description}</Dialog.Description> : null}
          <div className="mt-4">{children}</div>
          <Dialog.Close className={close} aria-label="Close">
            <X aria-hidden className="h-5 w-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Panel that slides from the right on desktop and up from the bottom on phones (filters, details). */
export function Sheet({ trigger, title, description, children, open, onOpenChange }: OverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={overlay} />
        <Dialog.Content
          className={cn(
            "fixed z-50 overflow-y-auto bg-surface p-6 shadow-pop focus:outline-none",
            "inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg",
            "md:inset-x-auto md:inset-y-0 md:bottom-auto md:right-0 md:h-full md:max-h-none md:w-[420px] md:rounded-none"
          )}
        >
          <Dialog.Title className="m-0 pr-10 font-display text-lg font-semibold text-ink">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mb-0 mt-1.5 text-sm text-muted">{description}</Dialog.Description> : null}
          <div className="mt-4">{children}</div>
          <Dialog.Close className={close} aria-label="Close">
            <X aria-hidden className="h-5 w-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const TOAST_TONE = {
  success: "border-success bg-success-tint",
  info: "border-primary bg-primary-tint",
  warning: "border-warning bg-warning-tint",
  danger: "border-danger bg-danger-tint"
} as const;

/**
 * Short confirmation after a server action ("Saved", "Application sent"). Server actions
 * redirect with ?flash=<key>; the page maps the key to text and renders <Toast>. It is
 * announced politely, dismisses itself after 6 s, and strips the flash param from the URL
 * so a reload doesn't show it again.
 */
export function Toast({ message, tone = "success", param = "flash" }: { message: ReactNode; tone?: keyof typeof TOAST_TONE; param?: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 8000);
    // Drop ?flash= from the address bar without a server round-trip (Next syncs native history).
    const url = new URL(window.location.href);
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return () => clearTimeout(t);
  }, [param]);
  if (!shown) return null;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "fixed bottom-20 left-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 items-start gap-3 rounded-md border px-4 py-3 text-sm text-ink shadow-pop lg:bottom-6",
        TOAST_TONE[tone]
      )}
    >
      <span className="flex-1">{message}</span>
      <button type="button" onClick={() => setShown(false)} aria-label="Dismiss" className="-m-1 inline-flex cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-ink">
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
