"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import MarketingHeader from "./MarketingHeader";
import { APP_AREAS } from "./nav";

/**
 * Chooses the page chrome: public pages get the marketing header/footer; signed-in areas
 * (whose layouts render the app shell) get none here.
 */
export default function SiteChrome({ children, footer, left, right }: { children: ReactNode; footer: ReactNode; left?: ReactNode; right?: ReactNode }) {
  const pathname = usePathname() || "/";
  // Area layouts own their chrome (the org layout renders the marketing chrome for its public pages).
  const inApp = APP_AREAS.some((a) => pathname === a || pathname.startsWith(a + "/"));
  if (inApp) return <>{children}</>;
  return (
    <>
      <MarketingHeader />
      {left || right ? (
        // Advertisement panels sit beside the page on wide screens only; the page keeps its usual width.
        <div className="mx-auto grid max-w-[1640px] gap-6 px-5 xl:grid-cols-[180px_minmax(0,1fr)_180px]">
          <div className="hidden py-8 xl:block">{left}</div>
          <main id="main" className="mx-auto min-h-[60vh] w-full max-w-content py-8 xl:px-0">
            {children}
          </main>
          <div className="hidden py-8 xl:block">{right}</div>
        </div>
      ) : (
        <main id="main" className="mx-auto min-h-[60vh] max-w-content px-5 py-8">
          {children}
        </main>
      )}
      {footer}
    </>
  );
}
