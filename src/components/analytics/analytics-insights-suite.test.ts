import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./analytics-insights-suite.tsx", import.meta.url), "utf8");

describe("analytics country breakdown", () => {
  it("uses the same expandable breakdown card pattern as device and browser details", () => {
    expect(source).toContain('import { AnalyticsBreakdownCard } from "./analytics-breakdown-card"');
    expect(source).toContain('kind="country"');
    expect(source).toContain('title="Countries"');
    expect(source).toContain("rows={breakdowns.countries}");
  });
});
