import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPCX 2026 Forecast",
  description: "Draw where SpaceX stock ends 2026, then see everyone else's line."
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
