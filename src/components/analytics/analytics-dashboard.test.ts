import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./analytics-dashboard.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./analytics-dashboard.module.css", import.meta.url), "utf8");

describe("analytics dashboard hierarchy", () => {
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

  it("keeps the behavior cards focused on one primary question", () => {
    expect(source).toContain("const ENGAGEMENT_PREVIEW_MILESTONES = [10, 30, 180]");
    expect(source).toContain("started a scan");
    expect(source).toContain("reached 1 minute");
    expect(source).toContain("More scan detail");
    expect(source).toContain("repeat rate");
    expect(source).toContain("per starter");
    expect(source).not.toContain("Opened finder");
  });

  it("uses the refined analytics sequence without duplicating the old source and trend views", () => {
    expect(source).toContain("AnalyticsBreakdownVisuals");
    expect(source).toContain("AnalyticsActivityHistory");
    expect(source).toContain("AnalyticsTrendData");
    expect(source).not.toContain("View exact trend data");
    expect(source).not.toContain('kind="source"');
  });

  it("keeps detailed audience drill-downs focused on devices and browsers", () => {
    expect(source).toContain('id="audience-breakdown-title"');
    expect(source).toContain("Devices and browsers");
    expect(source).toContain('kind="device"');
    expect(source).toContain('kind="browser"');
    expect(source).not.toContain('kind="country"');
    expect(styles).toContain(".breakdownGridTwo");
  });

  it("keeps scan-mode insight visible without an extra disclosure click", () => {
    expect(source).toContain('id="scan-method-title"');
    expect(source).toContain('title="Scan modes"');
    expect(source).not.toContain("detailDisclosure");
    expect(styles).toContain(".secondarySection");
  });

  it("uses the same compact panel language across audience and behavior cards", () => {
    expect(source).toContain("className={styles.panelMetric}");
    expect(styles).toContain("border-radius: .5rem;");
    expect(styles).toContain("border-bottom: 1px solid var(--line);");
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
  });
});
