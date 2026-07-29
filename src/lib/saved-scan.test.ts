import { describe, expect, it } from "vitest";

import { normalizeStoredScan } from "./saved-scan";

describe("saved scan restoration", () => {
  it("restores completed results and safely pauses an interrupted scan", () => {
    const restored = normalizeStoredScan({
      state: "running",
      speed: "fast",
      completed: 2,
      completedUrls: ["a", "b", "b"],
      total: 5,
      urls: ["a", "b", "c", "d", "e"],
      startedAt: "2026-07-29T12:00:00.000Z",
      scope: "all 5 volunteer calendars",
    }, "2026-07-29T12:01:00.000Z");

    expect(restored).toMatchObject({
      state: "stopped",
      completed: 2,
      completedUrls: ["a", "b"],
      finishedAt: "2026-07-29T12:01:00.000Z",
    });
  });

  it("ignores malformed saved scan state", () => {
    expect(normalizeStoredScan({ state: "complete", urls: "not-an-array" }, "2026-07-29T12:01:00.000Z")).toBeNull();
  });
});

