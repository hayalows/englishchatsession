import { afterEach, describe, expect, it, vi } from "vitest";

import { startFirstPartyAnalytics, trackFirstPartyEvent, trackScanStarted } from "./client";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

afterEach(() => {
  vi.useRealTimers();
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

  it("records one scan-start event with mode metadata", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: { pathname: "/" },
      localStorage: storage(),
      sessionStorage: storage(),
    });
    vi.stubGlobal("document", { referrer: "" });

    trackScanStarted("all");

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      eventName: "scan_started",
      pagePath: "/",
      metadata: { scanMode: "all" },
    });
  });

  it("sends visible-time milestones and cleans up its timer", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: { pathname: "/" },
      localStorage: storage(),
      sessionStorage: storage(),
      setTimeout,
      clearTimeout,
    });
    const documentStub = new EventTarget() as EventTarget & { referrer: string; visibilityState: string };
    documentStub.referrer = "";
    documentStub.visibilityState = "visible";
    vi.stubGlobal("document", documentStub);

    const cleanup = startFirstPartyAnalytics();
    vi.advanceTimersByTime(10_000);

    const events = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventName: "page_view" }),
      expect.objectContaining({ eventName: "presence" }),
      expect.objectContaining({ eventName: "engagement", metadata: { milestoneSeconds: 10 } }),
    ]));

    cleanup();
    vi.advanceTimersByTime(30_000);
    expect(fetchMock.mock.calls.filter((call) => String(call[1]?.body).includes('"eventName":"engagement"')).length).toBe(1);
  });

  it("does not send the same engagement milestone twice after a reload in one tab session", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const sessionStorage = storage();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: { pathname: "/", search: "", hostname: "englishchatsession.vercel.app" },
      localStorage: storage(),
      sessionStorage,
      setTimeout,
      clearTimeout,
    });
    const documentStub = new EventTarget() as EventTarget & { referrer: string; visibilityState: string };
    documentStub.referrer = "";
    documentStub.visibilityState = "visible";
    vi.stubGlobal("document", documentStub);

    const firstCleanup = startFirstPartyAnalytics();
    vi.advanceTimersByTime(10_000);
    firstCleanup();

    const secondCleanup = startFirstPartyAnalytics();
    vi.advanceTimersByTime(10_000);
    secondCleanup();

    const tenSecondEvents = fetchMock.mock.calls
      .map((call) => JSON.parse(String(call[1]?.body)))
      .filter((event) => event.eventName === "engagement" && event.metadata?.milestoneSeconds === 10);
    expect(tenSecondEvents).toHaveLength(1);
  });

  it("stores privacy-safe first-touch campaign attribution on page views", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: "?utm_source=linkedin&utm_medium=social&utm_campaign=ghana_launch&utm_term=private-search",
        hostname: "englishchatsession.vercel.app",
      },
      localStorage: storage(),
      sessionStorage: storage(),
    });
    vi.stubGlobal("document", { referrer: "https://www.linkedin.com/feed/" });

    trackFirstPartyEvent();

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.metadata).toEqual({
      utmSource: "linkedin",
      utmMedium: "social",
      utmCampaign: "ghana_launch",
    });
    expect(body.metadata).not.toHaveProperty("utmTerm");
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
