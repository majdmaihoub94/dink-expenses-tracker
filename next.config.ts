import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway runs the app from a slim runtime image; standalone bundles only
  // the files the server actually needs.
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    staleTimes: {
      // Keep visited screens in the client router cache so tab switching and
      // back-navigation render instantly instead of refetching every time.
      // Writes call revalidatePath, which clears this, so the numbers still
      // update the moment either of you logs something.
      dynamic: 30,
      static: 180,
    },
  },
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
