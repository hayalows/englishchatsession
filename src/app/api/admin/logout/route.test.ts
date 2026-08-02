import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/logout", () => {
  it("clears the administrator session cookie without caching the response", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("english-chat-admin-session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });
});
