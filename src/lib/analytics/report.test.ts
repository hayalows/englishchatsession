import { afterEach, describe, expect, it, vi } from "vitest";

const { analyticsDatabaseStatusMock, analyticsQueryMock } = vi.hoisted(() => ({
  analyticsDatabaseStatusMock: vi.fn(),
  analyticsQueryMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./neon", () => ({
  analyticsDatabaseStatus: analyticsDatabaseStatusMock,
  analyticsQuery: analyticsQueryMock,
}));

import { getAnalyticsReport } from "./report";
import { normalizeAnalyticsFilters } from "./filters";

afterEach(() => {
  analyticsDatabaseStatusMock.mockReset();
  analyticsQueryMock.mockReset();
});

describe("analytics filter normalization", () => {
  it("accepts the supported rolling windows and audience dimensions", () => {
    expect(normalizeAnalyticsFilters({ range: "90d", segment: "country", value: "GH" })).toEqual({
      range: "90d",
      segment: "country",
      value: "GH",
    });
  });

  it("fails closed to the simple default view for unsupported values", () => {
    expect(normalizeAnalyticsFilters({ range: "365d", segment: "email", value: "person@example.com" })).toEqual({
      range: "7d",
      segment: "all",
      value: null,
    });
  });

  it("does not keep a segment value when all traffic is selected", () => {
    expect(normalizeAnalyticsFilters({ range: "24h", segment: "all", value: "GH" })).toEqual({
      range: "24h",
      segment: "all",
      value: null,
    });
  });
});

describe("getAnalyticsReport", () => {
  it("returns filtered metrics and separates repeat scan visitors from raw scan clicks", async () => {
    analyticsDatabaseStatusMock.mockReturnValue("configured");
    analyticsQueryMock.mockImplementation(async (query: string) => {
      if (query.includes("repeat_scan_visitors")) {
        return [{ visitors: 10, sessions: 8, page_views: 12, scan_starts: 6, scan_starters: 4, repeat_scan_visitors: 2, frequent_scan_visitors: 1, engaged_sessions_60s: 3, returning_visitors: 4, active_now_visitors: 2, active_now_sessions: 2, latest_event_at: "2026-08-14T10:08:11.251Z" }];
      }
      if (query.includes("bucket_label")) {
        return [
          { bucket_label: "2026-W30", visitors: 4, page_views: 5, scan_starters: 2, scan_starts: 3 },
          { bucket_label: "2026-W31", visitors: 6, page_views: 7, scan_starters: 2, scan_starts: 3 },
        ];
      }
      if (query.includes("sort_order")) return [{ label: "1 scan", total: 2, sort_order: 1 }, { label: "2 scans", total: 2, sort_order: 2 }];
      if (query.includes("milestone_seconds")) return [{ milestone_seconds: "60", visitors: 2, sessions: 2 }, { milestone_seconds: "10", visitors: 5, sessions: 4 }];
      if (query.includes("metadata->>'scanMode'")) return [{ label: "all", total: 5 }];
      if (query.includes("LIMIT 30")) return [{ label: "GH", total: 8 }, { label: "US", total: 2 }];
      return [{ label: "GH", total: 8 }];
    });

    const report = await getAnalyticsReport({ range: "60d", segment: "country", value: "GH" });

    expect(report.filters).toMatchObject({
      range: "60d",
      rangeLabel: "Last 60 days",
      segment: "country",
      value: "GH",
      segmentLabel: "Country: Ghana (GH)",
      granularity: "week",
    });
    expect(report.metrics).toMatchObject({
      visitors: 10,
      pageViews: 12,
      scanStarts: 6,
      scanStarters: 4,
      scanStartRate: 40,
      repeatScanVisitors: 2,
      repeatScanRate: 50,
      frequentScanVisitors: 1,
      scansPerStarter: 1.5,
      engagedSessions60s: 3,
      returningVisitors: 4,
      returningVisitorRate: 40,
      activeNowVisitors: 2,
      activeNowSessions: 2,
    });
    expect(report.latestEventAt).toBe("2026-08-14T10:08:11.251Z");
    expect(report.trend).toHaveLength(2);
    expect(report.engagement.map((row) => row.milestoneSeconds)).toEqual([10, 60]);
    expect(report.filterOptions.map((row) => row.label)).toEqual(["GH", "US"]);
    expect(analyticsQueryMock.mock.calls.some(([query, params]) => String(query).includes("60 days") && JSON.stringify(params) === JSON.stringify(["GH"]))).toBe(true);
  });

  it("keeps the report renderable when analytics is disabled", async () => {
    analyticsDatabaseStatusMock.mockReturnValue("disabled");

    const report = await getAnalyticsReport({ range: "24h" });

    expect(report.status).toBe("disabled");
    expect(report.filters.rangeLabel).toBe("Last 24 hours");
    expect(report.metrics.visitors).toBe(0);
    expect(analyticsQueryMock).not.toHaveBeenCalled();
  });
});
