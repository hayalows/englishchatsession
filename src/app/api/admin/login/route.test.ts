import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

let ipCounter = 0;

function request(body: string, contentType = "application/json") {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    body,
    headers: {
      "content-type": contentType,
      "x-forwarded-for": `198.51.100.${ipCounter}`,
    },
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/login", () => {
  it("fails closed when administrator access is not configured", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "");

    const response = await POST(request(JSON.stringify({ password: "anything" })));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: "Administrator access is not configured yet." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an incorrect password without issuing a session cookie", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "a-long-test-password-123");

    const response = await POST(request(JSON.stringify({ password: "wrong-password" })));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("issues an HTTP-only same-site session cookie after a valid password", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "a-long-test-password-123");
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(request(JSON.stringify({ password: "a-long-test-password-123" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("english-chat-admin-session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});
