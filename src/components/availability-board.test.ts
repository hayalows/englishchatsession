import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSlotResult } from "../lib/slot-request";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("availability request retry", () => {
  it("retries a temporary provider result once and returns the recovered result", async () => {
    vi.useFakeTimers();
    const recovered = {
      status: "available" as const,
      availableDates: ["2026-08-01"],
      checkedAt: "2026-07-29T12:00:01.000Z",
      message: "1 available date confirmed from Google Calendar.",
      reasonCode: "confirmed_dates" as const,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "unknown",
          availableDates: [],
          checkedAt: "2026-07-29T12:00:00.000Z",
          message: "Google Calendar could not be reached reliably.",
          reasonCode: "request_failed",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => recovered,
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchSlotResult("https://calendar.google.com/calendar/appointments/schedules/abc");
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual(recovered);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
