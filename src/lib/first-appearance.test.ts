import { describe, expect, it } from "vitest";

import { FirstAppearanceTracker } from "./first-appearance";

describe("available-result first appearances", () => {
  it("animates one URL once during a scan", () => {
    const tracker = new FirstAppearanceTracker();
    tracker.beginScan();

    expect(tracker.discover("calendar-a")).toBe(true);
    expect(tracker.shouldAnimate("calendar-a")).toBe(true);
    tracker.markAnimated("calendar-a");
    expect(tracker.shouldAnimate("calendar-a")).toBe(false);
    expect(tracker.discover("calendar-a")).toBe(false);
  });

  it("does not replay when a result is filtered and rendered again", () => {
    const tracker = new FirstAppearanceTracker();
    tracker.beginScan();
    tracker.discover("calendar-a");
    tracker.markAnimated("calendar-a");

    expect(tracker.shouldAnimate("calendar-a")).toBe(false);
  });

  it("allows a confirmed opening to animate during a genuinely new scan", () => {
    const tracker = new FirstAppearanceTracker();
    tracker.beginScan();
    tracker.discover("calendar-a");
    tracker.markAnimated("calendar-a");

    tracker.beginScan();
    expect(tracker.discover("calendar-a")).toBe(true);
    expect(tracker.shouldAnimate("calendar-a")).toBe(true);
  });

  it("does not present restored results as newly discovered", () => {
    const tracker = new FirstAppearanceTracker();
    tracker.restore(["calendar-a"]);

    expect(tracker.shouldAnimate("calendar-a")).toBe(false);
    expect(tracker.discover("calendar-a")).toBe(false);
  });
});
