import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "./route";

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/slots", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.10",
      ...headers,
    },
  });
}

describe("POST /api/slots", () => {
  it("returns a normalized 400 response for malformed JSON", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "The request must contain valid JSON." });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unsupported booking hosts as a client error", async () => {
    const response = await POST(request(JSON.stringify({ bookingUrl: "https://example.com/appointments" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Only Google Calendar booking pages can be checked." });
  });

  it("rejects request bodies over the size limit", async () => {
    const response = await POST(request("{}", { "content-length": "4096" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ message: "The request is too large." });
  });
});
