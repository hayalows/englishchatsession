const VISITOR_KEY = "english-chat-anonymous-visitor:v1";
const SESSION_KEY = "english-chat-anonymous-session:v1";
const ATTRIBUTION_KEY = "english-chat-attribution:v1";
const ENGAGEMENT_PROGRESS_KEY = "english-chat-engagement-progress:v1";
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
export const ENGAGEMENT_MILESTONES = [10, 30, 60, 180] as const;
export const PRESENCE_INTERVAL_MS = 30_000;

export type ScanMode = "all" | "name";
type AnalyticsIds = { visitorId: string; sessionId: string };
type AnalyticsEventName = "page_view" | "scan_started" | "engagement" | "presence";
type EventMetadata = {
  scanMode?: ScanMode;
  milestoneSeconds?: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};
type Attribution = Pick<EventMetadata, "utmSource" | "utmMedium" | "utmCampaign">;
type EngagementProgress = { activeMilliseconds: number; milestones: number[] };

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
    const hostname = new URL(document.referrer).hostname.toLowerCase().slice(0, 120);
    const currentHostname = window.location.hostname?.toLowerCase();
    return hostname && hostname !== currentHostname ? hostname : null;
  } catch {
    return null;
  }
}

function campaignValue(value: string | null) {
  const normalized = value?.trim().slice(0, 80);
  return normalized || undefined;
}

function sessionAttribution(): Attribution {
  const storage = browserStorage("sessionStorage");
  try {
    const stored = storage?.getItem(ATTRIBUTION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Attribution;
      if (parsed && typeof parsed === "object") return parsed;
    }

    const params = new URLSearchParams(window.location.search ?? "");
    const attribution: Attribution = {
      utmSource: campaignValue(params.get("utm_source")),
      utmMedium: campaignValue(params.get("utm_medium")),
      utmCampaign: campaignValue(params.get("utm_campaign")),
    };
    const compact = Object.fromEntries(Object.entries(attribution).filter(([, value]) => Boolean(value))) as Attribution;
    if (Object.keys(compact).length) storage?.setItem(ATTRIBUTION_KEY, JSON.stringify(compact));
    return compact;
  } catch {
    return {};
  }
}

function readEngagementProgress(storage: Storage | null): EngagementProgress {
  try {
    const parsed = JSON.parse(storage?.getItem(ENGAGEMENT_PROGRESS_KEY) ?? "null") as Partial<EngagementProgress> | null;
    const activeMilliseconds = typeof parsed?.activeMilliseconds === "number" && Number.isFinite(parsed.activeMilliseconds)
      ? Math.max(0, Math.min(ENGAGEMENT_MILESTONES.at(-1)! * 1_000, parsed.activeMilliseconds))
      : 0;
    const milestones = Array.isArray(parsed?.milestones)
      ? parsed.milestones.filter((value): value is number => ENGAGEMENT_MILESTONES.includes(value as typeof ENGAGEMENT_MILESTONES[number]))
      : [];
    return { activeMilliseconds, milestones: Array.from(new Set(milestones)) };
  } catch {
    return { activeMilliseconds: 0, milestones: [] };
  }
}

function writeEngagementProgress(storage: Storage | null, progress: EngagementProgress) {
  try {
    storage?.setItem(ENGAGEMENT_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Session storage is optional; analytics remains best-effort.
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
  if (ids) sendEvent("page_view", ids, sessionAttribution());
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

  sendEvent("page_view", ids, sessionAttribution());
  sendEvent("presence", ids);

  const engagementStorage = browserStorage("sessionStorage");
  const engagementProgress = readEngagementProgress(engagementStorage);
  const reachedMilestones = new Set(engagementProgress.milestones);
  let activeSince = document.visibilityState === "hidden" ? null : performance.now();
  let activeMilliseconds = engagementProgress.activeMilliseconds;
  let milestoneIndex = ENGAGEMENT_MILESTONES.findIndex((milestone) => !reachedMilestones.has(milestone));
  if (milestoneIndex < 0) milestoneIndex = ENGAGEMENT_MILESTONES.length;
  let timer: number | null = null;
  let presenceTimer: number | null = null;

  const persistEngagement = () => writeEngagementProgress(engagementStorage, {
    activeMilliseconds,
    milestones: Array.from(reachedMilestones),
  });

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
    persistEngagement();
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
        const milestone = ENGAGEMENT_MILESTONES[milestoneIndex];
        if (!reachedMilestones.has(milestone)) {
          sendEvent("engagement", ids, { milestoneSeconds: milestone });
          reachedMilestones.add(milestone);
        }
        milestoneIndex += 1;
        persistEngagement();
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
    pauseClock();
    stopTimer();
    stopPresenceTimer();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
