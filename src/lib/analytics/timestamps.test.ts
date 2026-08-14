import { describe, expect, it } from "vitest";

import { displayCompactAnalyticsTimestamp } from "./timestamps";

describe("displayCompactAnalyticsTimestamp", () => {
  it("formats the freshness line with explicit time fields supported by the Vercel runtime", () => {
    expect(displayCompactAnalyticsTimestamp("2026-08-14T20:54:00.000Z")).toMatch(/^14 Aug, 20:54 UTC$/);
  });

  it("keeps empty and invalid event states readable", () => {
    expect(displayCompactAnalyticsTimestamp(null)).toBe("No events yet");
    expect(displayCompactAnalyticsTimestamp("not-a-date")).toBe("Not available");
  });
});
