import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CompletedScanOutcome } from "./completed-scan-outcome";

const actions = {
  onCheckAgain: vi.fn(),
  onFindAny: vi.fn(),
  onNewSearch: vi.fn(),
  onViewSessions: vi.fn(),
};

function renderOutcome(overrides: Partial<Parameters<typeof CompletedScanOutcome>[0]> = {}) {
  return renderToStaticMarkup(
    <CompletedScanOutcome
      available={0}
      checkedRange="29 Jul–27 Sept 2026"
      confirmedEmpty={210}
      isStale={false}
      later={0}
      nextWeek={0}
      singleTutor={null}
      temporarilyUnavailable={36}
      temporaryErrors={0}
      thisWeek={0}
      {...actions}
      {...overrides}
    />,
  );
}

describe("completed scan outcome", () => {
  it("shows a calm empty state without operational counts or retry-problem controls", () => {
    const markup = renderOutcome();

    expect(markup).toContain("Scan complete");
    expect(markup).toContain("No sessions available right now");
    expect(markup).toContain("between 29 Jul and 27 Sept 2026");
    expect(markup).toContain("Checked just now");
    expect(markup).toContain("Check again");
    expect(markup).toContain("New search");
    expect(markup).not.toContain("210");
    expect(markup).not.toContain("36");
    expect(markup).not.toContain("links unavailable");
    expect(markup).not.toContain("could not verify");
    expect(markup).not.toContain("Try problem checks again");
  });

  it("shows openings without mentioning failed or unavailable calendars", () => {
    const markup = renderOutcome({
      available: 3,
      confirmedEmpty: 180,
      later: 1,
      nextWeek: 1,
      temporarilyUnavailable: 40,
      temporaryErrors: 2,
      thisWeek: 1,
    });

    expect(markup).toContain("3 volunteers with open times");
    expect(markup).toContain("View available sessions");
    expect(markup).not.toContain("40");
    expect(markup).not.toContain("temporary");
    expect(markup).not.toContain("unavailable");
  });

  it("uses a full error only when the search produced no reliable result", () => {
    const markup = renderOutcome({
      confirmedEmpty: 0,
      temporarilyUnavailable: 0,
      temporaryErrors: 4,
    });

    expect(markup).toContain("Search incomplete");
    expect(markup).toContain("We couldn’t check availability");
    expect(markup).toContain("Check again");
    expect(markup).not.toContain("No sessions available right now");
  });

  it("keeps a restored result visible while clearly marking it as stale", () => {
    const markup = renderOutcome({
      available: 1,
      confirmedEmpty: 0,
      isStale: true,
      thisWeek: 1,
    });

    expect(markup).toContain("1 volunteer with open times");
    expect(markup).toContain("Checked earlier");
    expect(markup).toContain("Availability may have changed");
  });

  it("guides a student away from a temporarily unavailable single calendar", () => {
    const markup = renderOutcome({
      confirmedEmpty: 0,
      singleTutor: "Aaron Ludwig",
      temporarilyUnavailable: 1,
      temporaryErrors: 0,
    });

    expect(markup).toContain("This calendar is temporarily unavailable");
    expect(markup).toContain("Search all volunteers");
    expect(markup).not.toContain(">Check again<");
  });
});
