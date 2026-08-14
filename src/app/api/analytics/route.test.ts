import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/analytics/neon", () => ({
  analyticsDatabaseConfigured: () => false,
  analyticsQuery: vi.fn(),
}));

import { POST } from "./route";

let ipCounter = 0;

function request(body: string, headers: Record<string, string> = {}) {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/analytics", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `198.51.100.${ipCounter}`,
      ...headers,
    },
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/analytics", () => {
  it("accepts a valid event without a database and keeps the finder usable", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const response = await POST(request(JSON.stringify({
      visitorId: "visitor-1234",
      sessionId: "session-1234",
      eventName: "page_view",
      pagePath: "/",
    })));

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts one scan-start event and visible-time milestones", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const scanResponse = await POST(request(JSON.stringify({
      visitorId: "visitor-1234",
      sessionId: "session-1234",
      eventName: "scan_started",
      pagePath: "/",
      metadata: { scanMode: "all" },
    })));
    const engagementResponse = await POST(request(JSON.stringify({
      visitorId: "visitor-1234",
      sessionId: "session-1234",
      eventName: "engagement",
      pagePath: "/",
      metadata: { milestoneSeconds: 60 },
    })));

    expect(scanResponse.status).toBe(204);
    expect(engagementResponse.status).toBe(204);
  });

  it("rejects unsupported events, metadata, and non-finder paths", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const response = await POST(request(JSON.stringify({
      visitorId: "visitor-1234",
      sessionId: "session-1234",
      eventName: "scan_started",
      pagePath: "/",
    })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Invalid analytics event." });

    const pathResponse = await POST(request(JSON.stringify({
      visitorId: "visitor-1234",
      sessionId: "session-1234",
      eventName: "page_view",
      pagePath: "/analytics",
    })));

    expect(pathResponse.status).toBe(400);

    const metadataResponse = await POST(request(JSON.stringify({
      visitorId: "visitor-1234",
      sessionId: "session-1234",
      eventName: "engagement",
      pagePath: "/",
      metadata: { milestoneSeconds: 7_200 },
    })));

    expect(metadataResponse.status).toBe(400);
  });

  it("enforces the body limit even when content-length is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const response = await POST(request(JSON.stringify({
      visitorId: "visitor-1234",
      sessionId: "session-1234",
      eventName: "page_view",
      pagePath: "/",
      referrerHost: "x".repeat(5_000),
    }), { "content-length": "" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ message: "The request is too large." });
  });
});
