import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./analytics-dashboard.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./analytics-dashboard.module.css", import.meta.url), "utf8");

describe("analytics header hierarchy", () => {
  it("keeps freshness metadata out of the compact header", () => {
    expect(source).toContain("active now");
    expect(source).toContain("className={styles.statusRow}");
    expect(source).not.toContain("Latest event");
    expect(source).not.toContain("latest-event");
    expect(source).not.toContain("Checked");
    expect(source).not.toContain("displayGeneratedAt");
    expect(source).not.toContain("displayLatestEventAt");
    expect(styles).not.toContain(".freshness");
  });

  it("keeps the insight cards focused on one primary question", () => {
    expect(source).toContain('const ENGAGEMENT_PREVIEW_MILESTONES = [10, 30, 180]');
    expect(source).toContain('started a scan');
    expect(source).toContain('reached 1 minute');
    expect(source).toContain('Repeat-use details');
    expect(source).not.toContain('Opened finder');
    expect(source).not.toContain('See repeat-use detail');
  });

  it("uses plain-language, compact scan behavior summaries", () => {
    expect(source).toContain('return "Scan all listings"');
    expect(source).toContain('title="How scans were started"');
    expect(source).toContain('compact kind="source"');
    expect(styles).toContain("align-items: start;");
  });
});
