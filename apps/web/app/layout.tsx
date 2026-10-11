import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { getCurrentUser } from "../lib/backend";
import SiteNav from "./_components/SiteNav";

const inter = localFont({ src: "./fonts/Inter-Variable.woff2", variable: "--font-inter", display: "swap", weight: "100 900" });
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-Variable.woff2",
  variable: "--font-jakarta",
  display: "swap",
  weight: "200 800"
});

export const metadata = {
  title: "ThankYou",
  description: "A volunteer service marketplace for nonprofits and individuals.",
  icons: { icon: "/brand/favicon.svg" }
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>
        <header className="siteHeader">
          <div className="headerInner">
            <Link className="brand" href="/" aria-label="ThankYou">
              <span className="brandMark" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/logo-mark.svg" alt="" width={28} height={28} />
              </span>
              <span className="brandText">ThankYou</span>
            </Link>
            <SiteNav user={user} />
          </div>
        </header>

        <main>{children}</main>

        <footer className="siteFooter">
          <div className="footerInner">
            <div>© ThankYou</div>
            <div className="footerLinks">
              <Link href="/trust-safety">Trust & Safety</Link>
              <Link href="/code-of-conduct">Code of Conduct</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
