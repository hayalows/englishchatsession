import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const navSource = readFileSync(new URL("./admin-top-nav.tsx", import.meta.url), "utf8");
const navCss = readFileSync(new URL("./admin-top-nav.module.css", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../../app/admin/admin.module.css", import.meta.url), "utf8");
const copySource = readFileSync(new URL("../copy-icon-button.tsx", import.meta.url), "utf8");

describe("administrator visual shell", () => {
  it("keeps the admin header focused on administrator actions", () => {
    expect(navSource).toContain("site-header");
    expect(navSource).toContain("nav-shell");
    expect(navSource).toContain('className="site-brand"');
    expect(navSource).toContain('className="brand-mark"');
    expect(navSource).toContain("site-nav");
    expect(navSource).toContain("English Chat Finder");
    expect(navSource).toContain("Administrator console");
    expect(navSource).toContain("/api/admin/logout");
    expect(navSource).toContain("Preparation guide");
    expect(navSource).not.toContain('href="/"');
    expect(navSource).not.toContain("Student finder");
  });

  it("keeps the English Chat Finder name visible and removes low-priority header links on narrow screens", () => {
    expect(navCss).toContain(".brandCopy { display: grid !important; }");
    expect(navCss).toContain(".brandCopy strong");
    expect(navCss).toContain(".adminNav > a { display: none; }");
    expect(navCss).not.toContain(".brandCopy { display: none !important; }");
  });

  it("keeps controls readable and comfortably tappable", () => {
    expect(adminCss).toContain(".summaryCardAction.summaryCardAvailable:hover");
    expect(adminCss).toContain(".summaryCardAction.summaryCardAttention:hover");
    expect(adminCss).toContain(".summaryCardAction:active");
    expect(adminCss).toContain("top: calc(68px + .7rem)");
    expect(adminCss).toContain("top: calc(62px + .45rem)");
    expect(navCss).toContain(".logoutButton:hover");
    expect(navCss).toContain("min-height: 48px");
    expect(navCss).toContain("min-height: 52px");
    expect(copySource).toContain("showLabel = false");
    expect(copySource).toContain('"Copy link"');
  });
});
