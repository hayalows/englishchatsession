import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from "@/lib/admin/auth";
import { displayCountryLabel } from "@/lib/analytics/filters";
import {
  emptyAnalyticsReport,
  getAnalyticsReport,
  parseAnalyticsSearchParams,
} from "@/lib/analytics/report";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finder visits | English Chat Finder",
  description: "Private visitor analytics for English Chat Finder.",
  robots: { index: false, follow: false },
};

type AnalyticsSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AnalyticsPage({ searchParams }: { searchParams: AnalyticsSearchParams }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSessionToken(token)) redirect("/analytics/login");

  const filters = parseAnalyticsSearchParams(await searchParams);
  let report = emptyAnalyticsReport("error", filters);
  try {
    report = await getAnalyticsReport(filters);
  } catch {
    // Keep the visitor dashboard renderable if the report changes later.
  }

  const displayReport = {
    ...report,
    countries: report.countries.map((row) => ({
      ...row,
      label: displayCountryLabel(row.label),
    })),
  };

  return <AnalyticsDashboard report={displayReport} />;
}
