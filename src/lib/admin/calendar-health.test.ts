import { describe, expect, it } from "vitest";

import {
  classifySlotResult,
  createAdminProblem,
  filterAdminIssues,
  type AdminBookingPage,
} from "./calendar-health";

const page: AdminBookingPage = {
  tutor: "Kofi Mensah",
  bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/kofi",
};

function result(overrides: Record<string, unknown> = {}) {
  return {
    status: "unknown" as const,
    availableDates: [],
    checkedAt: "2026-08-01T04:32:00.000Z",
    message: "Google Calendar could not be reached reliably.",
    reasonCode: "request_failed" as const,
    ...overrides,
  };
}

describe("admin calendar health classification", () => {
  it("recognizes a confirmed available calendar as healthy availability", () => {
    const classified = classifySlotResult(page, result({
      status: "available",
      availableDates: ["2026-08-08"],
      availableTimes: ["2026-08-08T14:35:00.000Z"],
      message: "1 available date confirmed from Google Calendar.",
      reasonCode: "confirmed_dates",
    }));

    expect(classified.status).toBe("available");
    expect(classified.problemKind).toBeUndefined();
  });

  it("keeps a reliable empty range separate from a fault", () => {
    const classified = classifySlotResult(page, result({
      status: "none_in_view",
      message: "Google Calendar returned no open appointments in the next 60 days.",
      reasonCode: "confirmed_empty_range",
    }));

    expect(classified.status).toBe("no_openings");
    expect(classified.problemKind).toBeUndefined();
  });

  it("distinguishes unavailable calendars from temporary failures", () => {
    const unavailable = classifySlotResult(page, result({
      status: "failed",
      message: "Google says this appointment schedule is unavailable.",
      reasonCode: "schedule_unavailable",
    }));
    const temporary = createAdminProblem(page, {
      message: "Google temporarily limited requests.",
      reasonCode: "rate_limited",
      retryAfter: "2026-08-01T04:33:00.000Z",
    });

    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.problemKind).toBe("unavailable");
    expect(classifySlotResult(page, result()).reasonCode).toBe("request_failed");
    expect(temporary.status).toBe("temporary");
    expect(temporary.problemKind).toBe("temporary");
    expect(temporary.reasonLabel).toContain("limited");
  });

  it("filters only operational issues and keeps the two useful issue groups", () => {
    const results = [
      classifySlotResult(page, result({ status: "none_in_view", reasonCode: "confirmed_empty_range" })),
      classifySlotResult({ ...page, tutor: "Sarah Jones" }, result({ status: "failed", reasonCode: "schedule_unavailable" })),
      createAdminProblem({ ...page, tutor: "Ama Boateng" }, { message: "Timed out", reasonCode: "request_timeout" }),
    ];

    expect(filterAdminIssues(results, "all")).toHaveLength(2);
    expect(filterAdminIssues(results, "unavailable").map((item) => item.tutor)).toEqual(["Sarah Jones"]);
    expect(filterAdminIssues(results, "temporary").map((item) => item.tutor)).toEqual(["Ama Boateng"]);
  });
});
