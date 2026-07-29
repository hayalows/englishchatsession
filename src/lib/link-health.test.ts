import { describe, expect, it } from "vitest";

import {
  markLinkHealthy,
  markLinkPaused,
  planLinkChecks,
  reconcileLinkHealth,
  scheduleUnavailableCooldown,
  SCHEDULE_UNAVAILABLE_COOLDOWNS_MS,
  TEMPORARY_FAILURE_COOLDOWN_MS,
} from "./link-health";

const page = { tutor: "Ada Volunteer", bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/ada" };
const checkedAt = "2026-07-29T12:00:00.000Z";

describe("temporary booking-link health", () => {
  it("allows a previously healthy link to become temporarily unavailable", () => {
    const healthy = markLinkHealthy({}, page.bookingUrl, checkedAt, "confirmed_empty_range");
    const paused = markLinkPaused(
      healthy,
      page.bookingUrl,
      "2026-07-29T13:00:00.000Z",
      "schedule_unavailable",
      scheduleUnavailableCooldown(0),
    );

    expect(paused[page.bookingUrl]).toMatchObject({
      status: "paused",
      lastSuccessfulAt: checkedAt,
      consecutiveFailureCount: 1,
      reasonCode: "schedule_unavailable",
      retryAfter: "2026-07-29T13:30:00.000Z",
    });
  });

  it("excludes paused links from the visible total until their cooldown expires", () => {
    const paused = markLinkPaused(
      {},
      page.bookingUrl,
      checkedAt,
      "temporary_provider_failure",
      TEMPORARY_FAILURE_COOLDOWN_MS,
    );

    expect(planLinkChecks([page], paused, new Date("2026-07-29T12:09:59.000Z").valueOf())).toEqual({
      queued: [],
      paused: [page],
    });
    expect(planLinkChecks([page], paused, new Date("2026-07-29T12:10:00.000Z").valueOf())).toEqual({
      queued: [page],
      paused: [],
    });
  });

  it("returns a recovered link to the healthy pool after a future successful check", () => {
    const paused = markLinkPaused(
      {},
      page.bookingUrl,
      checkedAt,
      "schedule_unavailable",
      scheduleUnavailableCooldown(0),
    );
    const recoveredAt = "2026-07-29T20:01:00.000Z";
    const recovered = markLinkHealthy(paused, page.bookingUrl, recoveredAt, "confirmed_dates");

    expect(recovered[page.bookingUrl]).toEqual({
      status: "healthy",
      lastCheckedAt: recoveredAt,
      lastSuccessfulAt: recoveredAt,
      consecutiveFailureCount: 0,
      reasonCode: "confirmed_dates",
    });
    expect(planLinkChecks([page], recovered, new Date(recoveredAt).valueOf()).queued).toEqual([page]);
  });

  it("clears health when a volunteer replaces a booking URL", () => {
    const oldPage = { ...page, bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/old" };
    const newPage = { ...page, bookingUrl: "https://calendar.google.com/calendar/appointments/schedules/new" };
    const oldHealth = markLinkPaused(
      {},
      oldPage.bookingUrl,
      checkedAt,
      "schedule_unavailable",
      scheduleUnavailableCooldown(0),
    );

    const reconciled = reconcileLinkHealth(
      oldHealth,
      { "ada volunteer": [oldPage.bookingUrl] },
      [newPage],
    );

    expect(reconciled.health).toEqual({});
    expect(planLinkChecks([newPage], reconciled.health).queued).toEqual([newPage]);
  });

  it("checks a newly listed booking URL immediately even if stale health exists for that URL", () => {
    const staleHealth = markLinkPaused(
      {},
      page.bookingUrl,
      checkedAt,
      "schedule_unavailable",
      scheduleUnavailableCooldown(0),
    );

    const reconciled = reconcileLinkHealth(staleHealth, {}, [page]);

    expect(reconciled.health).toEqual({});
    expect(planLinkChecks([page], reconciled.health).queued).toEqual([page]);
  });

  it("backs off a repeatedly unavailable schedule without making the pause permanent", () => {
    expect(scheduleUnavailableCooldown(0)).toBe(SCHEDULE_UNAVAILABLE_COOLDOWNS_MS[0]);
    expect(scheduleUnavailableCooldown(1)).toBe(SCHEDULE_UNAVAILABLE_COOLDOWNS_MS[1]);
    expect(scheduleUnavailableCooldown(2)).toBe(SCHEDULE_UNAVAILABLE_COOLDOWNS_MS[2]);
    expect(scheduleUnavailableCooldown(20)).toBe(SCHEDULE_UNAVAILABLE_COOLDOWNS_MS[2]);
  });

  it("makes a paused schedule eligible again at the exact adaptive retry time", () => {
    const paused = markLinkPaused(
      {},
      page.bookingUrl,
      checkedAt,
      "schedule_unavailable",
      scheduleUnavailableCooldown(0),
    );

    expect(planLinkChecks([page], paused, new Date("2026-07-29T12:29:59.999Z").valueOf()).paused).toEqual([page]);
    expect(planLinkChecks([page], paused, new Date("2026-07-29T12:30:00.000Z").valueOf()).queued).toEqual([page]);
  });
});
