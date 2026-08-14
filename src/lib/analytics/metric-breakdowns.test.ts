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

import { getAnalyticsMetricBreakdowns } from "./metric-breakdowns";

afterEach(() => {
  analyticsDatabaseStatusMock.mockReset();
  analyticsQueryMock.mockReset();
});

describe("getAnalyticsMetricBreakdowns", () => {
  it("returns visitor, page-view, and scan-starter values for every breakdown", async () => {
    analyticsDatabaseStatusMock.mockReturnValue("configured");
    analyticsQueryMock.mockImplementation(async (query: string) => {
      if (query.includes("events.country")) return [{ label: "GH", visitors: 5, page_views: 11, scan_starters: 3 }];
      if (query.includes("events.device_type")) return [{ label: "Mobile", visitors: 4, page_views: 9, scan_starters: 2 }];
      if (query.includes("events.browser")) return [{ label: "Safari", visitors: 3, page_views: 7, scan_starters: 2 }];
      return [{ label: "Direct / unknown", visitors: 5, page_views: 11, scan_starters: 3 }];
    });

    const breakdowns = await getAnalyticsMetricBreakdowns({ range: "24h" });

    expect(breakdowns.countries[0]).toEqual({ label: "GH", visitors: 5, pageViews: 11, scanStarters: 3 });
    expect(breakdowns.devices[0]).toEqual({ label: "Mobile", visitors: 4, pageViews: 9, scanStarters: 2 });
    expect(breakdowns.browsers[0]).toEqual({ label: "Safari", visitors: 3, pageViews: 7, scanStarters: 2 });
    expect(breakdowns.referrers[0]).toEqual({ label: "Direct / unknown", visitors: 5, pageViews: 11, scanStarters: 3 });
    expect(analyticsQueryMock).toHaveBeenCalledTimes(4);
    for (const [query] of analyticsQueryMock.mock.calls) {
      expect(String(query)).toContain("date_trunc('day', now())");
      expect(String(query)).toContain("event_name = 'page_view'");
      expect(String(query)).toContain("event_name = 'scan_started'");
    }
  });

  it("uses the same audience filter for page views and scan events", async () => {
    analyticsDatabaseStatusMock.mockReturnValue("configured");
    analyticsQueryMock.mockResolvedValue([]);

    await getAnalyticsMetricBreakdowns({ range: "7d", segment: "country", value: "GH" });

    expect(analyticsQueryMock).toHaveBeenCalledTimes(4);
    for (const [query, params] of analyticsQueryMock.mock.calls) {
      expect(String(query)).toContain("coalesce(nullif(events.country, ''), 'Unknown') = $1");
      expect(params).toEqual(["GH"]);
    }
  });

  it("does not query when analytics storage is disabled", async () => {
    analyticsDatabaseStatusMock.mockReturnValue("disabled");

    const breakdowns = await getAnalyticsMetricBreakdowns({ range: "7d" });

    expect(breakdowns).toEqual({ countries: [], devices: [], browsers: [], referrers: [] });
    expect(analyticsQueryMock).not.toHaveBeenCalled();
  });
});
