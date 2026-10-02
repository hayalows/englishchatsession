import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./filter-toolbar.tsx", import.meta.url), "utf8");

describe("UIArc filter toolbar integration", () => {
  it("submits the stable option value while keeping the display label separate", () => {
    expect(source).toContain("value: row.key");
    expect(source).not.toContain("value: row.label");
    expect(source).toContain("label: text");
    expect(source).toContain("key: entry.value");
  });
});
