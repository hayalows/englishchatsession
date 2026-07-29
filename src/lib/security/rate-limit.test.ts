import { describe, expect, it } from "vitest";

import { createFixedWindowRateLimiter } from "./rate-limit";

describe("fixed-window rate limiter", () => {
  it("allows the configured number of requests and then blocks", () => {
    const consume = createFixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });

    expect(consume("student", 100).allowed).toBe(true);
    expect(consume("student", 200)).toMatchObject({ allowed: true, remaining: 0 });
    expect(consume("student", 300)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("starts a fresh allowance after the window resets", () => {
    const consume = createFixedWindowRateLimiter({ limit: 1, windowMs: 1_000 });

    expect(consume("student", 100).allowed).toBe(true);
    expect(consume("student", 200).allowed).toBe(false);
    expect(consume("student", 1_100)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("keeps separate clients independent", () => {
    const consume = createFixedWindowRateLimiter({ limit: 1, windowMs: 1_000 });

    expect(consume("student-a", 100).allowed).toBe(true);
    expect(consume("student-a", 200).allowed).toBe(false);
    expect(consume("student-b", 200).allowed).toBe(true);
  });
});
