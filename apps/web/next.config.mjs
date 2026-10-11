/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@thankyou/config", "@thankyou/contracts"],

  // One canonical URL per page; old paths redirect permanently.
  async redirects() {
    return [
      { source: "/volunteer", destination: "/volunteer/dashboard", permanent: true },
      { source: "/volunteer/opportunities", destination: "/volunteer/opportunities/recommended", permanent: true },
      { source: "/volunteer/saved", destination: "/volunteer/opportunities/saved", permanent: true },
      { source: "/requester", destination: "/requester/dashboard", permanent: true },
      { source: "/org", destination: "/org/dashboard", permanent: true },
      { source: "/org/enroll", destination: "/org/signup", permanent: true },
      // One inbox for every role (Phase 4.6).
      { source: "/volunteer/messages/:path*", destination: "/inbox", permanent: true },
      { source: "/requester/messages/:path*", destination: "/inbox", permanent: true },
      { source: "/org/messages/:path*", destination: "/inbox", permanent: true },
      { source: "/volunteer/messages", destination: "/inbox", permanent: true },
      { source: "/requester/messages", destination: "/inbox", permanent: true },
      { source: "/org/messages", destination: "/inbox", permanent: true },
      { source: "/dashboard/home", destination: "/home", permanent: true },
      { source: "/s/:token", destination: "/share/:token", permanent: true },
      { source: "/requester/organizations", destination: "/organizations", permanent: true },
      { source: "/requester/organizations/:id", destination: "/organizations", permanent: true }
    ];
  },

  async headers() {
    const security = [
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
