"use client";

import { useLinkStatus } from "next/link";

/**
 * Shown inside a navigation link while the page it opens is loading. Pages render on the server
 * in tens of milliseconds, so this only appears on a slow connection (it waits 150 ms).
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`ml-auto h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent ${pending ? "animate-spin opacity-70 [animation-delay:150ms]" : "opacity-0"}`}
    />
  );
}
