import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway runs the app from a slim runtime image; standalone bundles only
  // the files the server actually needs.
  output: "standalone",
  reactStrictMode: true,
  // Marking pdfjs-dist external stops Next's own bundler from inlining it,
  // which is a prerequisite for the tracing fix below.
  serverExternalPackages: ["pdfjs-dist"],
  // pdfjs-dist loads two things through paths the file tracer can't follow
  // statically: pdf.worker.mjs (built from a dynamic path at runtime, right
  // next to pdf.mjs but never traced with it) and @napi-rs/canvas (an
  // *optional* dependency, loaded through a try/catch to polyfill DOMMatrix
  // in Node). Without both, the deployed server crashes on `new DOMMatrix()`
  // or "Cannot find module pdf.worker.mjs" the moment a PDF is uploaded, even
  // though this route only ever extracts text and never renders anything.
  // serverExternalPackages stops Next's own bundler from inlining pdfjs-dist,
  // but can't reach what pdfjs-dist requires internally — only forcing the
  // glob here does.
  outputFileTracingIncludes: {
    "/api/import/parse": [
      "./node_modules/pdfjs-dist/**",
      "./node_modules/@napi-rs/canvas*/**",
    ],
  },
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
