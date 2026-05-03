import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["web-push"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Allow the React Native app to call auth + loan APIs
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Cookie, Authorization" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
};

export default nextConfig;
