"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[ThankYou Web] Global error", error);
  }, [error]);

  return (
    <div className="edgeShell">
      <div className="edgeCard">
        <h1 className="edgeTitle">Something went wrong</h1>
        <p className="edgeSubtitle">
          An unexpected error occurred. You can try again, or go back to a safe page.
        </p>

        <div className="edgeActions">
          <button className="btn" onClick={() => reset()}>Try again</button>
          <Link prefetch={false} className="btn btnSoft" href="/">Go home</Link>
        </div>

        {error?.digest ? (
          <p className="muted text-xs mt-3">
            Error ID: <code>{error.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
