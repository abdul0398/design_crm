import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "*": [
      "./storage/**/*",
      "./data/**/*",
      "./.env*",
      "./backups/**/*",
      "./tests/**/*",
    ],
  },
  experimental: { proxyClientMaxBodySize: "55mb" },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
export default config;
