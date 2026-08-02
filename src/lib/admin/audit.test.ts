import { afterEach, describe, expect, it, vi } from "vitest";

import { runAdminHealthAudit } from "./audit";

afterEach(() => vi.unstubAllGlobals());

describe("admin health audit orchestration", () => {
  it("uses the existing slot endpoint once per calendar and reports each classification", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { bookingUrl: string };
      const isOpen = body.bookingUrl.endsWith("open");
      return new Response(JSON.stringify({
        status: isOpen ? "available" : "none_in_view",
        availableDates: isOpen ? ["2026-08-08"] : [],
        availableTimes: isOpen ? ["2026-08-08T14:35:00.000Z"] : [],
        checkedAt: "2026-08-01T04:32:00.000Z",
        message: isOpen ? "1 available date confirmed from Google Calendar." : "Google Calendar returned no open appointments.",
        reasonCode: isOpen ? "confirmed_dates" : "confirmed_empty_range",
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await runAdminHealthAudit([
      { tutor: "Open volunteer", bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/open" },
      { tutor: "Empty volunteer", bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/empty" },
    ], { signal: new AbortController().signal });

    expect(report.state).toBe("complete");
    expect(report.completedCount).toBe(2);
    expect(report.results.map((result) => result.status).sort()).toEqual(["available", "no_openings"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "POST")).toBe(true);
  });

  it("classifies a rate limit as a temporary operational problem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Too many checks" }), {
      status: 429,
      headers: { "Retry-After": "60" },
    })));

    const report = await runAdminHealthAudit([
      { tutor: "Limited volunteer", bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/limited" },
    ], { signal: new AbortController().signal });

    expect(report.results[0]).toMatchObject({ status: "temporary", reasonCode: "rate_limited" });
    expect(report.results[0].retryAfter).toBeTruthy();
  });
});
