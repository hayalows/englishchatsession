const VISITOR_KEY = "english-chat-anonymous-visitor:v1";
const SESSION_KEY = "english-chat-anonymous-session:v1";
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
export const ENGAGEMENT_MILESTONES = [10, 30, 60, 180] as const;
export const PRESENCE_INTERVAL_MS = 30_000;

export type ScanMode = "all" | "name";
type AnalyticsIds = { visitorId: string; sessionId: string };
type AnalyticsEventName = "page_view" | "scan_started" | "engagement" | "presence";
type EventMetadata = { scanMode?: ScanMode; milestoneSeconds?: number };

let fallbackVisitorId: string | null = null;
let fallbackSessionId: string | null = null;

function newId() {
  if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.getRandomValues !== "function") return null;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function storedId(storage: Storage | null, key: string) {
  if (!storage) return null;

  try {
    const current = storage.getItem(key);
    if (current && ID_PATTERN.test(current)) return current;
    const next = newId();
    if (!next) return null;
    storage.setItem(key, next);
    return next;
  } catch {
    return null;
  }
}

function browserStorage(name: "localStorage" | "sessionStorage") {
  try {
    return window[name];
  } catch {
    return null;
  }
}

function browserIds() {
  let visitorId = storedId(browserStorage("localStorage"), VISITOR_KEY);
  let sessionId = storedId(browserStorage("sessionStorage"), SESSION_KEY);

  if (!visitorId) visitorId = fallbackVisitorId ?? newId();
  if (!sessionId) sessionId = fallbackSessionId ?? newId();
  if (!visitorId || !sessionId) return null;

  fallbackVisitorId = visitorId;
  fallbackSessionId = sessionId;
  return { visitorId, sessionId };
}

function referrerHost() {
  try {
    if (!document.referrer) return null;
    return new URL(document.referrer).hostname.toLowerCase().slice(0, 120) || null;
  } catch {
    return null;
  }
}

function isFinderPage() {
  return typeof window !== "undefined" && window.location.pathname === "/";
}

function sendEvent(eventName: AnalyticsEventName, ids: AnalyticsIds, metadata: EventMetadata = {}) {
  try {
    if (!isFinderPage()) return;

    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...ids,
        eventName,
        pagePath: "/",
        referrerHost: referrerHost(),
        metadata,
      }),
    }).catch(() => undefined);
  } catch {
    // Storage, URL, and browser privacy failures must never affect the finder.
  }
}

/**
 * Sends one anonymous page-view signal for the public finder only.
 * This is intentionally separate from scan instrumentation so a failed
 * analytics request can never interrupt the finder.
 */
export function trackFirstPartyEvent() {
  if (!isFinderPage()) return;
  const ids = browserIds();
  if (ids) sendEvent("page_view", ids);
}

/** Records one user-level scan request, never the calendars checked by it. */
export function trackScanStarted(scanMode: ScanMode) {
  if (!isFinderPage()) return;
  const ids = browserIds();
  if (ids) sendEvent("scan_started", ids, { scanMode });
}

/**
 * Starts page-view and active-time tracking for the public finder.
 * Engagement is measured in visible-time milestones, not exact browsing history.
 */
export function startFirstPartyAnalytics() {
  if (!isFinderPage() || typeof document === "undefined") return () => undefined;

  const ids = browserIds();
  if (!ids) return () => undefined;

  sendEvent("page_view", ids);
  sendEvent("presence", ids);

  let activeSince = document.visibilityState === "hidden" ? null : performance.now();
  let activeMilliseconds = 0;
  let milestoneIndex = 0;
  let timer: number | null = null;
  let presenceTimer: number | null = null;

  const stopTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  const stopPresenceTimer = () => {
    if (presenceTimer !== null) window.clearTimeout(presenceTimer);
    presenceTimer = null;
  };

  const schedulePresence = () => {
    if (activeSince === null) return;
    presenceTimer = window.setTimeout(() => {
      presenceTimer = null;
      if (activeSince === null || document.visibilityState === "hidden") return;
      sendEvent("presence", ids);
      schedulePresence();
    }, PRESENCE_INTERVAL_MS);
  };

  const pauseClock = () => {
    if (activeSince === null) return;
    activeMilliseconds += Math.max(0, performance.now() - activeSince);
    activeSince = null;
  };

  const resumeClock = () => {
    if (activeSince === null) activeSince = performance.now();
  };

  const scheduleNextMilestone = () => {
    if (activeSince === null || milestoneIndex >= ENGAGEMENT_MILESTONES.length) return;
    const nextMilestone = ENGAGEMENT_MILESTONES[milestoneIndex] * 1_000;
    const remaining = Math.max(250, nextMilestone - activeMilliseconds);
    timer = window.setTimeout(() => {
      timer = null;
      if (activeSince === null) return;
      activeMilliseconds += Math.max(0, performance.now() - activeSince);
      activeSince = performance.now();
      if (activeMilliseconds >= nextMilestone) {
        sendEvent("engagement", ids, { milestoneSeconds: ENGAGEMENT_MILESTONES[milestoneIndex] });
        milestoneIndex += 1;
      }
      scheduleNextMilestone();
    }, remaining);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      pauseClock();
      stopTimer();
      stopPresenceTimer();
      return;
    }
    resumeClock();
    scheduleNextMilestone();
    sendEvent("presence", ids);
    stopPresenceTimer();
    schedulePresence();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  scheduleNextMilestone();
  schedulePresence();

  return () => {
    stopTimer();
    stopPresenceTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
