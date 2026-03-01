import type { NextConfig } from "next";

const apiTarget = process.env.NEXT_PUBLIC_OAUTH_SERVER_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiTarget}/api/:path*` },
      { source: "/oauth/:path*", destination: `${apiTarget}/oauth/:path*` },
    ];
  },
};

export default nextConfig;
