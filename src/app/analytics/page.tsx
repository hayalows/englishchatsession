import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from "@/lib/admin/auth";
import { getAnalyticsReport, type AnalyticsReport } from "@/lib/analytics/report";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finder visits | English Chat Finder",
  description: "Private visitor analytics for English Chat Finder.",
  robots: { index: false, follow: false },
};

const EMPTY_REPORT: AnalyticsReport = {
  status: "error",
  generatedAt: new Date(0).toISOString(),
  metrics: {
    visitorsToday: 0,
    visitors7d: 0,
    visitors30d: 0,
    pageViews7d: 0,
    sessions7d: 0,
  },
  daily: [],
  countries: [],
  referrers: [],
  devices: [],
};

export default async function AnalyticsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSessionToken(token)) redirect("/analytics/login");

  let report = EMPTY_REPORT;
  try {
    report = await getAnalyticsReport();
  } catch {
    // Keep the visitor dashboard renderable if the report changes later.
  }

  return <AnalyticsDashboard report={report} />;
}
