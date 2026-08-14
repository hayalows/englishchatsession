import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./analytics-dashboard.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./analytics-dashboard.module.css", import.meta.url), "utf8");

describe("analytics header hierarchy", () => {
  it("keeps freshness metadata out of the compact header", () => {
    expect(source).toContain("active now");
    expect(source).toContain("className={styles.statusRow}");
    expect(source).not.toContain("Latest event");
    expect(source).not.toContain("Checked");
    expect(source).not.toContain("displayGeneratedAt");
    expect(source).not.toContain("displayLatestEventAt");
    expect(styles).not.toContain(".freshness");
  });
});
