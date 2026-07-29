import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

describe("finder action sizing", () => {
  it("stretches only the initial finder action at a 48px control height", () => {
    const initialAction = css.match(/\.scan-primary\s*\{([^}]+)\}/)?.[1] ?? "";
    const resultActions = css.match(/\.outcome-actions\s*>\s*button\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(initialAction).toContain("justify-self: stretch");
    expect(initialAction).toContain("justify-content: center");
    expect(initialAction).toContain("min-height: 48px");
    expect(initialAction).toContain("width: 100%");
    expect(resultActions).toContain("width: fit-content");
  });

  it("keeps completed actions full-width only at the small-mobile breakpoint", () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*410px\)[\s\S]*?\.outcome-actions\s*>\s*button[\s\S]*?\{\s*width:\s*100%;\s*\}/,
    );
  });
});

