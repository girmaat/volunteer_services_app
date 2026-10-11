/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@thankyou/config", "@thankyou/contracts"]
};
export default nextConfig;
