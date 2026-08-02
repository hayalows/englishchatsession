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
