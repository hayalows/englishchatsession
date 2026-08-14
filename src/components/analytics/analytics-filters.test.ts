import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./analytics-filters.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./analytics-filters.module.css", import.meta.url), "utf8");

describe("analytics header filters", () => {
  it("keeps time-range links and audience filters in the compact toolbar", () => {
    expect(source).toContain("function rangeHref");
    expect(source).toContain('input name="range" type="hidden" value={filters.range}');
    expect(source).toContain("className={styles.rangePanel}");
    expect(source).toContain("className={styles.filterPanel}");
    expect(styles).toContain("min-height: 44px;");
    expect(styles).toContain(".rangePanel");
  });
});
