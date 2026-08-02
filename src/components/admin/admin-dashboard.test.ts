import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./admin-dashboard.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../../app/admin/login/page.tsx", import.meta.url), "utf8");

describe("admin/student state separation", () => {
  it("uses an explicit admin audit and does not read student scan storage", () => {
    expect(dashboardSource).toContain("runAdminHealthAudit");
    expect(dashboardSource).toContain("english-chat-admin-audit:v1");
    expect(dashboardSource).not.toContain("english-chat-booking-results:v2");
    expect(dashboardSource).not.toContain("english-chat-link-health:v1");
  });

  it("keeps the administrator password out of the client login page", () => {
    expect(loginSource).not.toContain("ADMIN_PASSWORD");
    expect(loginSource).not.toContain("process.env");
    expect(loginSource).toContain("/api/admin/login");
  });
});

describe("admin operations navigation", () => {
  it("makes the important operational tasks directly discoverable", () => {
    expect(dashboardSource).toContain('aria-label="Admin views"');
    expect(dashboardSource).toContain('{ id: "overview", label: "Overview" }');
    expect(dashboardSource).toContain('{ id: "availability", label: "Openings" }');
    expect(dashboardSource).toContain('{ id: "issues", label: "Issues" }');
    expect(dashboardSource).toContain('{ id: "volunteers", label: "Volunteers" }');
    expect(dashboardSource).toContain('setView("availability")');
    expect(dashboardSource).toContain('setView("issues")');
    expect(dashboardSource).toContain('setView("volunteers")');
  });

  it("keeps the overview focused while exposing full task views and clear audit guidance", () => {
    expect(dashboardSource).toContain("const overviewAvailable = available.slice(0, 3);");
    expect(dashboardSource).toContain("const overviewIssues = allIssues.slice(0, 3);");
    expect(dashboardSource).toContain("See all openings");
    expect(dashboardSource).toContain("Review all");
    expect(dashboardSource).toContain("Run a calendar audit first.");
    expect(dashboardSource).toContain("Copy issue report");
    expect(dashboardSource).toContain('href={result.bookingUrl}');
  });

  it("matches the student brand language and credits the builder in the admin footer", () => {
    expect(dashboardSource).toContain('className="site-footer"');
    expect(dashboardSource).toContain("English Chat Finder");
    expect(dashboardSource).toContain("Designed and built by Papa Kojo Mensah");
    expect(dashboardSource).toContain("Student finder");
    expect(dashboardSource).toContain("Administrator audits do not change student scan state");
  });
});
