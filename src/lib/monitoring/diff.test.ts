import { describe, expect, it } from "vitest";

import { detectSessionChanges } from "./diff";
import type { NormalizedSession, StoredSession } from "./types";

const current: NormalizedSession = { sourceId: "a", title: "English Chat booking", tutor: "Ada", sessionDate: null, startTime: null, endTime: null, sourceTimezone: null, bookingUrl: "https://calendar.app.google/a", status: "open", rawData: {} };
const stored: StoredSession = { id: "1", source_id: "a", title: "English Chat booking", tutor: "Ada", session_date: null, start_time: null, end_time: null, source_timezone: null, booking_url: "https://calendar.app.google/a", status: "open", raw_data: {} };

describe("detectSessionChanges", () => {
  it("detects new, reopened, time, and details changes without duplicate unchanged alerts", () => {
    expect(detectSessionChanges([], [current])[0].type).toBe("new_session");
    expect(detectSessionChanges([{ ...stored, status: "unavailable" }], [current])[0].type).toBe("reopened_session");
    expect(detectSessionChanges([{ ...stored, start_time: "10:00" }], [{ ...current, startTime: "11:00" }])[0].type).toBe("time_changed");
    expect(detectSessionChanges([stored], [{ ...current, tutor: "Adele" }])[0].type).toBe("details_changed");
    expect(detectSessionChanges([stored], [current])).toHaveLength(0);
  });
});
