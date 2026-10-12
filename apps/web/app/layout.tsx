import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import SiteChrome from "../components/shell/SiteChrome";
import MarketingFooter from "../components/shell/MarketingFooter";

const inter = localFont({ src: "./fonts/Inter-Variable.woff2", variable: "--font-inter", display: "swap", weight: "100 900" });
const jakarta = localFont({ src: "./fonts/PlusJakartaSans-Variable.woff2", variable: "--font-jakarta", display: "swap", weight: "200 800" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3202";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ThankYou — volunteer with neighbors and nonprofits", template: "%s · ThankYou" },
  description: "Find in-person and remote volunteer opportunities, ask neighbors for help, and track the difference you make.",
  icons: { icon: "/brand/favicon.svg" },
  // The default share image is app/opengraph-image.tsx (PNG, 1200×630).
  openGraph: { type: "website", siteName: "ThankYou" },
  twitter: { card: "summary_large_image" }
};

export const viewport: Viewport = { themeColor: "#0f6e66", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>
        <a className="skipLink" href="#main">
          Skip to content
        </a>
        <SiteChrome footer={<MarketingFooter />}>{children}</SiteChrome>
      </body>
    </html>
  );
}
