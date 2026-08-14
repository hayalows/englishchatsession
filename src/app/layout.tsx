import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";

import { FirstPartyAnalytics } from "@/components/first-party-analytics";

import { PwaRegister } from "./pwa-register";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "English Chat Finder | Find an Open Appointment",
  description: "Check volunteer Google Calendars and find an open English Chat appointment.",
  applicationName: "English Chat Finder",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/app-icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chat Finder",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        {children}
        <PwaRegister />
        <FirstPartyAnalytics />
        <Analytics />
      </body>
    </html>
  );
}
