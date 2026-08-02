import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../../app/admin/page.tsx", import.meta.url), "utf8");
const typographyCss = readFileSync(new URL("../../app/admin/admin-v1-8.module.css", import.meta.url), "utf8");
const progressiveSource = readFileSync(new URL("./admin-progressive-lists.tsx", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string };

describe("v1.8 administrator experience", () => {
  it("ships the administrator experience as v1.8.0", () => {
    expect(packageJson.version).toBe("1.8.0");
    expect(pageSource).toContain("AdminProgressiveLists");
    expect(pageSource).toContain("adminV18");
  });

  it("uses readable platform-native typography and material-like type sizing", () => {
    expect(typographyCss).toContain('BlinkMacSystemFont, "Segoe UI", Roboto');
    expect(typographyCss).toContain("--admin-body-size: 1rem");
    expect(typographyCss).toContain("--admin-label-size: .875rem");
    expect(typographyCss).toContain("font-size: 1rem");
    expect(typographyCss).toContain("line-height: 1.5");
  });

  it("progressively reveals long operational lists", () => {
    expect(progressiveSource).toContain("AVAILABILITY_PAGE_SIZE = 5");
    expect(progressiveSource).toContain("ISSUE_PAGE_SIZE = 8");
    expect(progressiveSource).toContain("Show ${Math.min(config.pageSize, remaining)} more");
    expect(progressiveSource).toContain("Show fewer");
    expect(progressiveSource).toContain('section[aria-labelledby="availability-title"]');
    expect(progressiveSource).toContain('section[aria-labelledby="issues-title"]');
  });
});
