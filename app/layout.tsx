import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Preflop Solver — 6-Max Preflop Range Trainer | PrefLopLab",
    template: "%s | PrefLopLab",
  },
  description:
    "Drill 6-max preflop ranges hand by hand: opening ranges, defending against a raise, and responding to a 3-bet. 35 charts at 100bb, free.",
  applicationName: "PrefLopLab",
  keywords: [
    "preflop ranges", "preflop chart", "6-max preflop", "opening range",
    "3-bet range", "poker range trainer", "preflop trainer", "GTO preflop",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "PrefLopLab",
    url: "/",
    title: "Preflop Solver — 6-Max Preflop Range Trainer",
    description:
      "Drill 6-max preflop ranges hand by hand: opening, facing a raise, and facing a 3-bet.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Preflop Solver — 6-Max Preflop Range Trainer",
    description:
      "Drill 6-max preflop ranges hand by hand: opening, facing a raise, and facing a 3-bet.",
  },
  robots: { index: true, follow: true },
};

// Without this the phone browser lays the page out at a desktop width and
// then zooms the whole thing out to fit, which is what made the table
// unreadable on mobile.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
