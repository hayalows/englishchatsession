import { describe, expect, it } from "vitest";

import { classifyCalendarSnapshot, type CalendarSnapshot } from "./slot-classifier";

const base: CalendarSnapshot = { availableDates: [], hasCalendarDays: true, hasJumpButton: false, saysNoAvailability: false, cellFingerprint: "calendar" };

describe("classifyCalendarSnapshot", () => {
  it("reports dates that Google exposes", () => {
    const result = classifyCalendarSnapshot({ ...base, availableDates: ["2026-07-24"], rangeStart: "2026-07-22", rangeEnd: "2026-08-08" }, false, "2026-07-22T00:00:00.000Z");
    expect(result.status).toBe("available");
    expect(result.availableDates).toEqual(["2026-07-24"]);
    expect(result.checkedRange?.description).toContain("2026-07-22 through 2026-08-08");
  });

  it("reports a confirmed empty range only when no later-date control exists", () => {
    const result = classifyCalendarSnapshot({ ...base, saysNoAvailability: true, rangeLabel: "22 Jul through 8 Aug" }, false);
    expect(result.status).toBe("none_in_view");
    expect(result.reasonCode).toBe("confirmed_empty_range");
  });

  it("never labels an unreadable jumped view as no availability", () => {
    const result = classifyCalendarSnapshot({ ...base, saysNoAvailability: true }, true);
    expect(result.status).toBe("unknown");
    expect(result.reasonCode).toBe("jump_unreadable");
  });
});

