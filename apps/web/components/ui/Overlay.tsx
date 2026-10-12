"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

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
