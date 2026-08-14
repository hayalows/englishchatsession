import { afterEach, describe, expect, it, vi } from "vitest";

import { trackFirstPartyEvent } from "./client";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("first-party analytics client", () => {
  it("never throws when the analytics request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("analytics offline"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: { pathname: "/" },
      localStorage: storage(),
      sessionStorage: storage(),
    });
    vi.stubGlobal("document", { referrer: "" });

    expect(() => trackFirstPartyEvent()).not.toThrow();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      eventName: "page_view",
      pagePath: "/",
    });
  });

  it("keeps anonymous IDs stable when browser storage is blocked", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const blockedWindow = {
      location: { pathname: "/" },
      sessionStorage: storage(),
    } as Record<string, unknown>;
    Object.defineProperty(blockedWindow, "localStorage", {
      get: () => { throw new Error("storage blocked"); },
    });
    vi.stubGlobal("window", blockedWindow);
    vi.stubGlobal("document", { referrer: "" });

    trackFirstPartyEvent();
    trackFirstPartyEvent();

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.visitorId).toBe(secondBody.visitorId);
    expect(firstBody.sessionId).toBe(secondBody.sessionId);
  });

  it.each(["/admin", "/admin/analytics", "/analytics", "/analytics/login"]) (
    "does not send page views from %s",
    (pathname) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      vi.stubGlobal("window", {
        location: { pathname },
        localStorage: storage(),
        sessionStorage: storage(),
      });

      trackFirstPartyEvent();

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
