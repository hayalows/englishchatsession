import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkBookingSlots,
  extractSlotTimestamps,
  InvalidBookingUrlError,
  isTrustedBookingUrl,
  LegacyBookingLandingError,
  resolveScheduleId,
} from "./slots";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractSlotTimestamps", () => {
  it("extracts and sorts Google's nested slot timestamps", () => {
    const payload = [[[[["1789057800"], 30]], [[["1789059600"], 30]], [[["1789057800"], 30]]]];
    expect(extractSlotTimestamps(payload)).toEqual([1789057800, 1789059600]);
  });

  it("does not mistake an API error response for availability", () => {
    expect(extractSlotTimestamps([5, "Requested entity was not found."])).toEqual([]);
  });

  it("returns no slots for an empty availability response", () => {
    expect(extractSlotTimestamps([])).toEqual([]);
  });

  it("accepts only HTTPS Google Calendar booking hosts", () => {
    expect(isTrustedBookingUrl("https://calendar.google.com/calendar/appointments/schedules/abc")).toBe(true);
    expect(isTrustedBookingUrl("https://calendar.app.google/example")).toBe(true);
    expect(isTrustedBookingUrl("http://calendar.google.com/calendar/appointments/schedules/abc")).toBe(false);
    expect(isTrustedBookingUrl("https://calendar.google.com.example.com/calendar/appointments/schedules/abc")).toBe(false);
  });

  it("rejects a short booking link that redirects outside Google Calendar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://example.com/calendar/appointments/schedules/abc",
    }));

    await expect(resolveScheduleId("https://calendar.app.google/example")).rejects.toBeInstanceOf(InvalidBookingUrlError);
  });

  it("accepts a short booking link that resolves to a trusted schedule", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://calendar.google.com/calendar/appointments/schedules/abc",
    }));

    await expect(resolveScheduleId("https://calendar.app.google/example")).resolves.toBe("abc");
  });

  it("does not permanently classify a legacy organizer landing page as a missing schedule", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://calendar.google.com/calendar/appointments/organizer-id",
    }));

    await expect(resolveScheduleId("https://calendar.app.google/example")).rejects.toBeInstanceOf(LegacyBookingLandingError);
    await expect(checkBookingSlots("https://calendar.app.google/example")).resolves.toMatchObject({
      status: "unknown",
      reasonCode: "request_failed",
    });
  });
});
