import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealSmart - Monopoly Deal vs AI",
  description: "Play Monopoly Deal against AI opponents powered by Claude Opus 4.6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-gray-950">
        {children}
      </body>
    </html>
  );
}
