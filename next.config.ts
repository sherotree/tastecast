import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev server blocks cross-origin HMR when the browser uses 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
