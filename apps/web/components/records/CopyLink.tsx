"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A read-only link with a copy button. */
export default function CopyLink({ url, label = "Link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`l-${url}`}>
        {label}
      </label>
      <input id={`l-${url}`} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded border border-line-strong bg-surface px-3 text-sm" />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* the input is selectable as a fallback */
          }
        }}
        className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:border-ink"
      >
        {copied ? <Check aria-hidden className="h-4 w-4 text-success" /> : <Copy aria-hidden className="h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
