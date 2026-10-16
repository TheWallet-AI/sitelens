import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SiteLens — See your website clearly",
  description:
    "Open-source GEO readiness checks with evidence. See what crawlers can read and what your customers can do next.",
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
