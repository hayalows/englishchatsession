import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adminPasswordsMatch,
  adminSessionCookieOptions,
  createAdminSessionToken,
  isValidAdminSessionToken,
} from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("admin session protection", () => {
  it("creates and validates a signed, expiring session without exposing the password in the token", () => {
    vi.stubEnv("ADMIN_PASSWORD", "a-long-test-password-123");
    const now = Date.parse("2026-08-01T04:32:00.000Z");
    const token = createAdminSessionToken(now);

    expect(token).toBeTruthy();
    expect(token).not.toContain("a-long-test-password-123");
    expect(isValidAdminSessionToken(token ?? undefined, now)).toBe(true);
    expect(isValidAdminSessionToken(token ?? undefined, now + (8 * 60 * 60 * 1_000) + 1)).toBe(false);
  });

  it("uses timing-safe password comparison and secure HTTP-only same-site cookie settings", () => {
    vi.stubEnv("ADMIN_PASSWORD", "a-long-test-password-123");

    expect(adminPasswordsMatch("a-long-test-password-123")).toBe(true);
    expect(adminPasswordsMatch("wrong-password")).toBe(false);
    expect(adminSessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});
