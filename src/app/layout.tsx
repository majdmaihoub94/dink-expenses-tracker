import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "DINX",
  description: "A shared budget tracker for two — expenses, income, savings and bills in one place.",
  applicationName: "DINX",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DINX",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F6F3FB",
  width: "device-width",
  initialScale: 1,
  // Locking zoom keeps the app feeling native; text is sized generously to
  // compensate and the layout reflows down to 320px.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
