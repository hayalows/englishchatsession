import { describe, expect, it } from "vitest";

import type { SlotResult } from "./monitoring/results";
import {
  chooseRecommendedView,
  countAvailableTimes,
  datesInUserTime,
  earliestAvailableTime,
  hasDateInWeek,
  localDateKey,
  openingGroup,
} from "./result-presentation";

const now = new Date(2026, 6, 23, 10, 0);

function available(overrides: Partial<SlotResult> = {}): SlotResult {
  return {
    status: "available",
    availableDates: ["2026-07-24"],
    availableTimes: ["2026-07-24T17:30:00.000Z"],
    message: "Open times found.",
    ...overrides,
  };
}

describe("result presentation", () => {
  it("groups openings into the current week, next week, and later", () => {
    expect(openingGroup(available(), now)).toBe("this_week");
    expect(openingGroup(available({
      availableDates: ["2026-07-30"],
      availableTimes: ["2026-07-30T17:30:00.000Z"],
    }), now)).toBe("next_week");
    expect(openingGroup(available({
      availableDates: ["2026-08-14"],
      availableTimes: ["2026-08-14T17:30:00.000Z"],
    }), now)).toBe("later");
  });

  it("uses local dates derived from appointment timestamps", () => {
    const result = available({
      availableDates: ["2026-07-25"],
      availableTimes: ["2026-07-24T23:30:00-05:00"],
    });

    expect(datesInUserTime(result)).toEqual([localDateKey("2026-07-24T23:30:00-05:00")]);
    expect(hasDateInWeek(result, 0, now)).toBe(true);
  });

  it("returns the earliest valid appointment and counts every returned time", () => {
    const result = available({
      availableDates: ["2026-07-24", "2026-07-25"],
      availableTimes: [
        "2026-07-25T17:30:00.000Z",
        "invalid",
        "2026-07-24T17:30:00.000Z",
      ],
    });

    expect(earliestAvailableTime(result)).toBe("2026-07-24T17:30:00.000Z");
    expect(countAvailableTimes(result)).toBe(3);
  });

  it("does not turn missing or unsuccessful checks into openings", () => {
    expect(openingGroup(undefined, now)).toBeNull();
    expect(openingGroup({
      status: "unknown",
      availableDates: [],
      message: "Could not confirm.",
    }, now)).toBeNull();
    expect(countAvailableTimes({
      status: "none_in_view",
      availableDates: [],
      message: "No openings.",
    })).toBe(0);
  });

  it("chooses the most useful result view after a scan", () => {
    expect(chooseRecommendedView({ thisWeek: 2, nextWeek: 3, later: 4 })).toBe("this_week");
    expect(chooseRecommendedView({ thisWeek: 0, nextWeek: 1, later: 4 })).toBe("next_week");
    expect(chooseRecommendedView({ thisWeek: 0, nextWeek: 0, later: 3 })).toBe("later");
    expect(chooseRecommendedView({ thisWeek: 0, nextWeek: 0, later: 0 })).toBe("best");
  });
});
