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
    expect(source).toContain("function countryFlagFromCode");
    expect(source).toContain("className={styles.countryFlag}");
    expect(styles).toContain("Apple Color Emoji");
  });
});
