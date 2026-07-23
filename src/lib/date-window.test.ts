import { describe, expect, it } from "vitest";

import { dateAtEndOfWindow, isDateWithinDays } from "./date-window";

describe("inclusive date window", () => {
  const today = new Date(2026, 6, 23, 18, 30);

  it("includes today and the date exactly seven days away", () => {
    expect(isDateWithinDays("2026-07-23", 7, today)).toBe(true);
    expect(isDateWithinDays("2026-07-30", 7, today)).toBe(true);
  });

  it("excludes dates outside the window and invalid dates", () => {
    expect(isDateWithinDays("2026-07-22", 7, today)).toBe(false);
    expect(isDateWithinDays("2026-07-31", 7, today)).toBe(false);
    expect(isDateWithinDays("2026-02-30", 7, today)).toBe(false);
  });

  it("returns the inclusive end date", () => {
    expect(dateAtEndOfWindow(7, today)).toEqual(new Date(2026, 6, 30));
  });
});
