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

  it("keeps the time and traffic panels exclusive and dismissible", () => {
    expect(source).toContain('type OpenPanel = "range" | "filter" | null;');
    expect(source).toContain('document.addEventListener("pointerdown", handlePointerDown)');
    expect(source).toContain('event.key !== "Escape" || !openPanel');
    expect(source).toContain("aria-expanded={openPanel === \"range\"}");
    expect(source).toContain("aria-expanded={openPanel === \"filter\"}");
    expect(styles).toContain('.rangeDisclosure[data-open="true"]');
    expect(styles).toContain('.filterDisclosure[data-open="true"]');
  });
});
