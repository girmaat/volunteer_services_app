"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import MarketingHeader from "./MarketingHeader";
import { APP_AREAS } from "./nav";

/**
 * Chooses the page chrome: public pages get the marketing header/footer; signed-in areas
 * (whose layouts render the app shell) get none here.
 */
export default function SiteChrome({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const pathname = usePathname() || "/";
  // Area layouts own their chrome (the org layout renders the marketing chrome for its public pages).
  const inApp = APP_AREAS.some((a) => pathname === a || pathname.startsWith(a + "/"));
  if (inApp) return <>{children}</>;
  return (
    <>
      <MarketingHeader />
      <main id="main" className="mx-auto min-h-[60vh] max-w-content px-5 py-8">
        {children}
      </main>
      {footer}
    </>
  );
}
