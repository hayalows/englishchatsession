import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("analytics page filter choices", () => {
  it("loads unscoped replacement choices only when an audience filter is active", () => {
    expect(source).toContain('const unscopedFilters = { ...filters, segment: "all" as const, value: null }');
    expect(source).toContain('filters.segment === "all" ? Promise.resolve(null) : getAnalyticsMetricBreakdowns(unscopedFilters)');
    expect(source).toContain("filterBreakdowns={displayFilterBreakdowns}");
  });
});
