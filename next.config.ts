import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway runs the app from a slim runtime image; standalone bundles only
  // the files the server actually needs.
  output: "standalone",
  reactStrictMode: true,
  async headers() {
    return [
      {
        // The service worker must never be cached, otherwise clients get
        // stuck on an old version and stop receiving push notifications.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
