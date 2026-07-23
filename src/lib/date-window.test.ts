import { describe, expect, it } from "vitest";

import { getWeekWindow, isDateInWeek } from "./date-window";

describe("Monday through Sunday week windows", () => {
  const today = new Date(2026, 6, 23, 18, 30);

  it("places dates in the current Monday through Sunday week", () => {
    expect(isDateInWeek("2026-07-20", 0, today)).toBe(true);
    expect(isDateInWeek("2026-07-26", 0, today)).toBe(true);
    expect(isDateInWeek("2026-07-27", 0, today)).toBe(false);
  });

  it("places the following Monday through Sunday in next week", () => {
    expect(isDateInWeek("2026-07-27", 1, today)).toBe(true);
    expect(isDateInWeek("2026-07-30", 1, today)).toBe(true);
    expect(isDateInWeek("2026-08-02", 1, today)).toBe(true);
    expect(isDateInWeek("2026-08-03", 1, today)).toBe(false);
  });

  it("returns stable inclusive boundaries across a year change", () => {
    expect(getWeekWindow(1, new Date(2026, 11, 31))).toEqual({
      start: new Date(2027, 0, 4),
      end: new Date(2027, 0, 10),
    });
  });

  it("rejects invalid dates", () => {
    expect(isDateInWeek("2026-02-30", 0, today)).toBe(false);
  });
});
