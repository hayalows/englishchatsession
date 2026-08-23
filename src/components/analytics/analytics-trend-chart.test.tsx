import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AnalyticsReport } from "@/lib/analytics/report";

import { AnalyticsTrendChart } from "./analytics-trend-chart";

const report: AnalyticsReport = {
  status: "configured",
  generatedAt: "2026-08-15T12:00:00.000Z",
  latestEventAt: "2026-08-15T11:59:00.000Z",
  filters: {
    range: "24h",
    rangeLabel: "Today",
    segment: "all",
    value: null,
    segmentLabel: "All traffic",
    trendLabel: "Hourly, UTC",
    granularity: "hour",
  },
  metrics: {
    visitors: 1,
    sessions: 1,
    pageViews: 1,
    scanStarts: 1,
    scanStarters: 1,
    scanStartRate: 100,
    repeatScanVisitors: 0,
    repeatScanRate: 0,
    frequentScanVisitors: 0,
    scansPerStarter: 1,
    engagedSessions60s: 0,
    returningVisitors: 0,
    returningVisitorRate: 0,
    activeNowVisitors: 0,
    activeNowSessions: 0,
  },
  trend: [{
    label: "2026-08-15 12",
    visitors: 1,
    pageViews: 1,
    scanStarters: 1,
    scanStarts: 1,
  }],
  countries: [],
  referrers: [],
  devices: [],
  browsers: [],
  scanModes: [],
  engagement: [],
  scanFrequency: [],
  filterOptions: [],
};

function comparison(overrides: Partial<{
  audienceReady: boolean;
  scanReady: boolean;
  previous: {
    visitors: number;
    pageViews: number;
    scanStarts: number;
    scanStarters: number;
    scanStartRate: number;
  };
}> = {}) {
  return {
    label: "yesterday",
    audienceReady: false,
    scanReady: false,
    audienceReadyAt: "2026-08-16T00:00:00.000Z",
    scanReadyAt: "2026-08-16T00:00:00.000Z",
    previous: {
      visitors: 0,
      pageViews: 0,
      scanStarts: 0,
      scanStarters: 0,
      scanStartRate: 0,
    },
    ...overrides,
  };
}

describe("analytics KPI comparison badges", () => {
  it("shows one neutral baseline message while comparison history is building", () => {
    const markup = renderToStaticMarkup(
      <AnalyticsTrendChart
        activeMetric="visitors"
        comparison={comparison()}
        onMetricChange={() => undefined}
        report={report}
      />,
    );

    expect(markup).not.toContain(">New<");
    expect(markup).toContain("Baseline building");
    expect(markup).toContain("Comparison begins 16 Aug");
    expect(markup.match(/>—</g)).toHaveLength(3);
  });

  it("shows percentage changes once a comparable baseline exists", () => {
    const markup = renderToStaticMarkup(
      <AnalyticsTrendChart
        activeMetric="visitors"
        comparison={comparison({
          audienceReady: true,
          scanReady: true,
          previous: {
            visitors: 2,
            pageViews: 2,
            scanStarts: 1,
            scanStarters: 1,
            scanStartRate: 50,
          },
        })}
        onMetricChange={() => undefined}
        report={report}
      />,
    );

    expect(markup).toContain(">−50%<");
    expect(markup).toContain(">+50 pts<");
    expect(markup).not.toContain(">New<");
  });

  it("never renders scan usage above 100 percent even when legacy rows are inconsistent", () => {
    const inconsistentReport: AnalyticsReport = {
      ...report,
      metrics: { ...report.metrics, visitors: 4, scanStarters: 4, scanStartRate: 100 },
      trend: [{
        label: "2026-08-15 12",
        visitors: 4,
        pageViews: 4,
        scanStarters: 5,
        scanStarts: 5,
      }],
    };

    const markup = renderToStaticMarkup(
      <AnalyticsTrendChart
        activeMetric="scanUsage"
        comparison={comparison()}
        onMetricChange={() => undefined}
        report={inconsistentReport}
      />,
    );

    expect(markup).toContain("100% scan usage");
    expect(markup).not.toContain("125%");
  });
});
