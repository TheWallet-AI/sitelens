import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SiteLens — AI discoverability and agent readiness checks",
  description:
    "Open-source, evidence-based checks of what search engines and AI agents can find, understand and act on across your public website.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8faf6" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1714" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
