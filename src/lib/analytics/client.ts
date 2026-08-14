const VISITOR_KEY = "english-chat-anonymous-visitor:v1";
const SESSION_KEY = "english-chat-anonymous-session:v1";
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

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

/**
 * Sends one anonymous page-view signal for the public finder only.
 * The scanner does not call this function and must not depend on it.
 */
export function trackFirstPartyEvent() {
  try {
    if (typeof window === "undefined" || window.location.pathname !== "/") return;

    const ids = browserIds();
    if (!ids) return;

    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...ids,
        eventName: "page_view",
        pagePath: "/",
        referrerHost: referrerHost(),
      }),
    }).catch(() => undefined);
  } catch {
    // Storage, URL, and browser privacy failures must never affect the finder.
  }
}
