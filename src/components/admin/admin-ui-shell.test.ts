import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const navSource = readFileSync(new URL("./admin-top-nav.tsx", import.meta.url), "utf8");
const navCss = readFileSync(new URL("./admin-top-nav.module.css", import.meta.url), "utf8");
const adminCss = readFileSync(new URL("../../app/admin/admin.module.css", import.meta.url), "utf8");

describe("administrator visual shell", () => {
  it("reuses the student navigation language with administrator actions", () => {
    expect(navSource).toContain("site-header");
    expect(navSource).toContain("nav-shell");
    expect(navSource).toContain('className="site-brand"');
    expect(navSource).toContain('className="brand-mark"');
    expect(navSource).toContain("site-nav");
    expect(navSource).toContain("nav-primary");
    expect(navSource).toContain('href="/"');
    expect(navSource).toContain("English Chat Finder");
    expect(navSource).toContain("Administrator console");
    expect(navSource).toContain("/api/admin/logout");
    expect(navSource).toContain("Prepare");
  });

  it("keeps the English Chat Finder name visible on narrow admin screens", () => {
    expect(navCss).toContain(".brandCopy { display: grid !important; }");
    expect(navCss).toContain(".brandCopy strong");
    expect(navCss).toContain(".studentMobile { display: inline; }");
    expect(navCss).not.toContain(".brandCopy { display: none !important; }");
  });

  it("keeps hover and touch states readable instead of inheriting the global primary-button hover", () => {
    expect(adminCss).toContain(".summaryCardAction.summaryCardAvailable:hover");
    expect(adminCss).toContain(".summaryCardAction.summaryCardAttention:hover");
    expect(adminCss).toContain(".summaryCardAction:active");
    expect(adminCss).toContain("top: calc(68px + .7rem)");
    expect(adminCss).toContain("top: calc(62px + .45rem)");
    expect(navCss).toContain(".logoutButton:hover");
  });
});
