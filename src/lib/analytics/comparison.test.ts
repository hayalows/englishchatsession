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

import { getAnalyticsComparison } from "./comparison";

afterEach(() => {
  analyticsDatabaseStatusMock.mockReset();
  analyticsQueryMock.mockReset();
  vi.useRealTimers();
});

describe("getAnalyticsComparison", () => {
  it("waits until a complete production baseline exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
    analyticsDatabaseStatusMock.mockReturnValue("configured");

    const comparison = await getAnalyticsComparison({ range: "24h" });

    expect(comparison.audienceReady).toBe(false);
    expect(comparison.scanReady).toBe(false);
    expect(comparison.label).toBe("previous 24 hours");
    expect(analyticsQueryMock).not.toHaveBeenCalled();
  });

  it("reads the immediately preceding equal window with the same audience filter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T08:00:00Z"));
    analyticsDatabaseStatusMock.mockReturnValue("configured");
    analyticsQueryMock.mockResolvedValue([{ visitors: 8, page_views: 12, scan_starts: 5, scan_starters: 4 }]);

    const comparison = await getAnalyticsComparison({ range: "24h", segment: "country", value: "GH" });

    expect(comparison.audienceReady).toBe(true);
    expect(comparison.scanReady).toBe(true);
    expect(comparison.previous).toEqual({
      visitors: 8,
      pageViews: 12,
      scanStarts: 5,
      scanStarters: 4,
      scanStartRate: 50,
    });
    expect(analyticsQueryMock).toHaveBeenCalledTimes(1);
    expect(analyticsQueryMock.mock.calls[0]?.[1]).toEqual(["GH"]);
    expect(String(analyticsQueryMock.mock.calls[0]?.[0])).toContain("interval '24 hours'");
  });
});
