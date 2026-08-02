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
    expect(dashboardSource).toContain('aria-label="Administrator tasks"');
    expect(dashboardSource).toContain('{ id: "overview", label: "Overview" }');
    expect(dashboardSource).toContain('{ id: "availability", label: "Availability" }');
    expect(dashboardSource).toContain('{ id: "issues", label: "Issues" }');
    expect(dashboardSource).toContain('{ id: "volunteers", label: "Volunteers" }');
    expect(dashboardSource).toContain('setView("availability")');
    expect(dashboardSource).toContain('setView("issues")');
    expect(dashboardSource).toContain('setView("volunteers")');
  });

  it("keeps the overview short while exposing full task views and audit guidance", () => {
    expect(dashboardSource).toContain("const overviewAvailable = available.slice(0, 3);");
    expect(dashboardSource).toContain("const overviewIssues = allIssues.slice(0, 3);");
    expect(dashboardSource).toContain("Review all {attentionCount} issues");
    expect(dashboardSource).toContain("View all {summary.available} available");
    expect(dashboardSource).toContain("Audit complete");
    expect(dashboardSource).toContain("Run a health audit before searching current volunteer status.");
    expect(dashboardSource).toContain("Copy issue report");
    expect(dashboardSource).toContain('href={result.bookingUrl}');
  });
});
