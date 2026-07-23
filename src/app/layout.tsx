import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "English Chat Finder | Find an Open Appointment",
  description: "Check volunteer Google Calendars and find an open English Chat appointment.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={instrumentSerif.variable}>{children}</body>
    </html>
  );
}
