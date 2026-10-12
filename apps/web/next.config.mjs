/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@thankyou/config", "@thankyou/contracts"],

  async redirects() {
    // Section roots go to their home page; /s/ is the short form of share links.
    return [
      { source: "/volunteer", destination: "/volunteer/dashboard", permanent: true },
      { source: "/volunteer/opportunities", destination: "/volunteer/opportunities/recommended", permanent: true },
      { source: "/requester", destination: "/requester/dashboard", permanent: true },
      { source: "/org", destination: "/org/dashboard", permanent: true },
      { source: "/s/:token", destination: "/share/:token", permanent: true }
    ];
  },

  async headers() {
    // Content-Security-Policy: everything comes from this site. Next.js needs inline scripts for its
    // bootstrap ('unsafe-inline'); React escapes all user text and no page renders raw HTML, so the
    // policy's job is to stop anything injected from loading code, frames or images from elsewhere.
    const dev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self'${dev ? " ws: wss:" : ""}`,
      "media-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ");
    const security = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" }
    ];
    if (process.env.NODE_ENV === "production") {
      security.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers: security }];
  }
};
export default nextConfig;
