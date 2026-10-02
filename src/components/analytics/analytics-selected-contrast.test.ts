import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const trendStyles = readFileSync(new URL("./analytics-trend-chart.module.css", import.meta.url), "utf8");
const segmentedStyles = readFileSync(new URL("../arc/segmented-control/segmented-control.module.css", import.meta.url), "utf8");
const filterStyles = readFileSync(new URL("../arc/filter-toolbar/filter-toolbar.module.css", import.meta.url), "utf8");
const dateStyles = readFileSync(new URL("../arc/date-range-picker/date-range-picker.module.css", import.meta.url), "utf8");

describe("analytics selected-state contrast", () => {
  it("uses a dark accent surface with light text for selected controls", () => {
    expect(trendStyles).toContain('.summaryButton[aria-pressed="true"]');
    expect(trendStyles).toContain("background: var(--teal-700);");
    expect(trendStyles).toContain("color: white;");
    expect(segmentedStyles).toContain('.button[aria-pressed="true"] { color: var(--accent-foreground);');
    expect(segmentedStyles).toContain("background: var(--accent);");
    expect(filterStyles).toContain('.item[aria-checked="true"] { background: var(--accent); color: var(--accent-foreground); }');
    expect(dateStyles).toContain('.preset[aria-pressed="true"] { background: var(--accent); color: var(--accent-foreground);');
  });
});
