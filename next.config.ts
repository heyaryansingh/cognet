import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    // conventional-path aliases — external links and agents guess these
    return [
      { source: "/login", destination: "/auth/sign-in", permanent: false },
      { source: "/signup", destination: "/auth/sign-up", permanent: false },
      { source: "/register", destination: "/auth/sign-up", permanent: false },
    ];
  },
};

export default nextConfig;
