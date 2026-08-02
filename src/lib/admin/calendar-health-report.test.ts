import { describe, expect, it } from "vitest";

import { classifySlotResult, createAdminProblem } from "./calendar-health";
import {
  findAuditedVolunteers,
  formatAdminIssueReport,
  getAdminHealthSummary,
  markRecovered,
} from "./calendar-health-report";

const availablePage = {
  tutor: "Kofi Mensah",
  bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/kofi",
};
const emptyPage = {
  tutor: "Ama Boateng",
  bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/ama",
};

const available = classifySlotResult(availablePage, {
  status: "available",
  availableDates: ["2026-08-08"],
  availableTimes: ["2026-08-08T14:35:00.000Z"],
  checkedAt: "2026-08-01T04:32:00.000Z",
  message: "1 available date confirmed from Google Calendar.",
  reasonCode: "confirmed_dates",
});
const empty = classifySlotResult(emptyPage, {
  status: "none_in_view",
  availableDates: [],
  checkedAt: "2026-08-01T04:32:00.000Z",
  message: "Google Calendar returned no open appointments.",
  reasonCode: "confirmed_empty_range",
});
const unavailable = classifySlotResult({
  tutor: "Sarah Jones",
  bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/sarah",
}, {
  status: "failed",
  availableDates: [],
  checkedAt: "2026-08-01T04:32:00.000Z",
  message: "Schedule unavailable.",
  reasonCode: "schedule_unavailable",
});
const temporary = createAdminProblem({
  tutor: "Yaw Mensah",
  bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/yaw",
}, {
  checkedAt: "2026-08-01T04:32:00.000Z",
  message: "Timed out.",
  reasonCode: "request_timeout",
});

describe("admin calendar health reporting", () => {
  it("summarizes healthy, available, empty, unavailable, and temporary results", () => {
    const summary = getAdminHealthSummary([available, empty, unavailable, temporary], 5, new Date("2026-08-01T12:00:00Z"));

    expect(summary).toMatchObject({
      listed: 5,
      checked: 4,
      notChecked: 1,
      healthy: 2,
      available: 1,
      noOpenings: 1,
      unavailable: 1,
      temporary: 1,
      nextWeek: 1,
    });
    expect(summary.earliestOpening?.bookingUrl).toBe(availablePage.bookingUrl);
  });

  it("marks a calendar recovered only when a previous issue is now healthy", () => {
    const recovered = markRecovered([available, empty], [
      createAdminProblem(availablePage, { message: "Timed out.", reasonCode: "request_timeout" }),
      empty,
    ]);

    expect(recovered.find((item) => item.bookingUrl === availablePage.bookingUrl)?.recovered).toBe(true);
    expect(recovered.find((item) => item.bookingUrl === emptyPage.bookingUrl)?.recovered).toBe(false);
  });

  it("formats a human-readable issue report with exact official links", () => {
    const report = formatAdminIssueReport({
      state: "complete",
      startedAt: "2026-08-01T04:30:00.000Z",
      finishedAt: "2026-08-01T04:32:00.000Z",
      listedCount: 4,
      completedCount: 4,
    }, [unavailable, temporary]);

    expect(report).toContain("CALENDARS REQUIRING ATTENTION");
    expect(report).toContain("Sarah Jones");
    expect(report).toContain(unavailable.bookingUrl);
    expect(report).toContain("Status: Calendar unavailable when checked");
    expect(report).toContain("Reason: Schedule unavailable");
    expect(report).not.toContain("{\"status\"");
  });

  it("uses the explicit zero-problem message", () => {
    const report = formatAdminIssueReport({
      state: "complete",
      startedAt: "2026-08-01T04:30:00.000Z",
      finishedAt: "2026-08-01T04:32:00.000Z",
      listedCount: 1,
      completedCount: 1,
    }, [empty]);

    expect(report).toContain("No calendar problems were found in this audit.");
  });

  it("searches only already-audited volunteer results", () => {
    expect(findAuditedVolunteers([available, empty], "kofi").map((item) => item.tutor)).toEqual(["Kofi Mensah"]);
    expect(findAuditedVolunteers([available, empty], "missing")).toEqual([]);
  });
});
