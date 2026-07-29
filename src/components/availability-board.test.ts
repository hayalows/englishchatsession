import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSlotResult } from "../lib/slot-request";

const boardSource = readFileSync(new URL("./availability-board.tsx", import.meta.url), "utf8");

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

describe("finder state cues", () => {
  it("shows the loading spinner only through the loading branch of the primary action", () => {
    expect(boardSource).toContain('{loading ? <span className="loading-spinner" aria-hidden="true" /> : null}');
    expect(boardSource.match(/className="loading-spinner"/g)).toHaveLength(1);
  });

  it("adds the travelling progress treatment only to the running scan progress bar", () => {
    expect(boardSource).toMatch(/scan\?\.state === "running"[\s\S]*?className="progress-track is-active"/);
    expect(boardSource.match(/progress-track is-active/g)).toHaveLength(1);
  });

  it("keeps volunteer-name search behind progressive disclosure", () => {
    expect(boardSource).toContain("Looking for a specific volunteer?");
    expect(boardSource).toContain('disabled={scanMode !== "name"}');
    expect(boardSource).not.toContain('className="scan-mode-options"');
  });

  it("keeps public operational copy calm and renames the list refresh action", () => {
    expect(boardSource).toContain("Update volunteer list");
    expect(boardSource).toContain("currently waiting.");
    expect(boardSource).not.toContain("Try problem checks again");
  });
});
