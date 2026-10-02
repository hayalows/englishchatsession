import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./analytics-filters.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./analytics-filters.module.css", import.meta.url), "utf8");

describe("analytics header filters", () => {
  it("uses the unified date and audience filter primitives", () => {
    expect(source).not.toContain("<SegmentedControl");
    expect(source).toContain('from "../arc/date-range-picker/date-range-picker"');
    expect(source).toContain('from "../arc/filter-toolbar/filter-toolbar"');
    expect(source).toContain("presets={DATE_PRESETS}");
    expect(source).toContain("<DateRangePicker");
    expect(source).toContain("<AnalyticsFilterInteraction");
    expect(source).toContain("function rangeHref");
    expect(source).toContain("function audienceHref");
  });

  it("keeps custom ranges bounded to recorded history through today", () => {
    expect(source).toContain("minDate={HISTORY_START}");
    expect(source).toContain("maxDate={todayUtc}");
    expect(source).toContain("function utcCalendarToday()");
    expect(source).toContain("onChange={chooseCustom}");
    expect(source).toContain('range: "custom"');
    expect(source).toContain("from: dateKey(range.start)");
    expect(source).toContain("to: dateKey(range.end)");
  });

  it("uses one clear audience-filter chip because the backend supports one dimension at a time", () => {
    expect(source).toContain("const activeFilters");
    expect(source).toContain("return [{ id: filters.segment, label, value }]");
    expect(source).toContain('label: "Country"');
    expect(source).toContain('label: "Device"');
    expect(source).toContain('label: "Browser"');
    expect(source).toContain('label: "Traffic source"');
    expect(source).toContain("onClick={clearFilter}");
  });

  it("moves secondary controls into a mobile bottom sheet", () => {
    expect(source).toContain('from "../arc/bottom-sheet/bottom-sheet"');
    expect(source).toContain("<BottomSheet");
    expect(source).toContain('title="Date range"');
    expect(source).toContain("mobileFilterButton");
    expect(styles).toContain(".desktopControls");
    expect(styles).toContain(".mobileControls");
    expect(styles).toContain("@media (max-width: 760px)");
  });
});
