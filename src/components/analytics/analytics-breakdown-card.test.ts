import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./analytics-breakdown-card.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./analytics-breakdown-card.module.css", import.meta.url), "utf8");

describe("analytics audience breakdown detail rows", () => {
  it("keeps the decorative fill out of the four-column detail layout", () => {
    expect(source).toContain('aria-hidden="true" className={styles.dialogRowFill}');
    expect(styles).toContain(".dialogRow > *:not(.dialogRowFill)");
    expect(styles).not.toContain(".dialogRow > * { position: relative;");
    expect(styles).toContain(".dialogRowFill");
    expect(styles).toContain("position: absolute;");
  });

  it("renders country flags from the existing ISO country labels", () => {
    expect(source).toContain('from "country-flag-icons/react/3x2"');
    expect(source).toContain("className={styles.countryFlag}");
    expect(source).toContain("className={styles.countryCodeFallback}");
    expect(styles).not.toContain("Apple Color Emoji");
  });

  it("uses a compact Vercel-style action dock without duplicating card metadata", () => {
    expect(source).toContain("className={styles.metricLabel}");
    expect(source).toContain("className={styles.actionDock}");
    expect(source).toContain('data-tooltip="View all"');
    expect(source).toContain('data-tooltip="Export CSV"');
    expect(source).toContain("ArrowsOutSimple");
    expect(source).toContain("DownloadSimple");
    expect(styles).toContain(".card:hover .actionDock");
    expect(styles).toContain(".card:focus-within .actionDock");
    expect(styles).toContain(".titleBlock::after");
    expect(styles).toContain("@media (hover: none), (pointer: coarse)");
    expect(source).not.toContain("Showing 5 of");
    expect(source).not.toContain("Share of selected metric");
  });
});
