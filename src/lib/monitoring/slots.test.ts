import { describe, expect, it } from "vitest";

import { extractSlotTimestamps } from "./slots";

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
});
