"use client";

import { useEffect } from "react";

const VISITOR_KEY = "english-chat-anonymous-visitor:v1";
const SESSION_KEY = "english-chat-anonymous-session:v1";
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

type AnalyticsEventName = "page_view" | "booking_clicked";
type AnalyticsMetadata = Record<string, string | number | boolean>;

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function storedId(storage: Storage, key: string) {
  try {
    const current = storage.getItem(key);
    if (current && ID_PATTERN.test(current)) return current;
    const next = newId();
    storage.setItem(key, next);
    return next;
  } catch {
    return newId();
  }
}

function referrerHost() {
  if (!document.referrer) return null;
  try {
    return new URL(document.referrer).hostname.toLowerCase().slice(0, 120);
  } catch {
    return null;
  }
}

export function trackFirstPartyEvent(eventName: AnalyticsEventName, metadata: AnalyticsMetadata = {}) {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return;

  const visitorId = storedId(window.localStorage, VISITOR_KEY);
  const sessionId = storedId(window.sessionStorage, SESSION_KEY);

  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      visitorId,
      sessionId,
      eventName,
      pagePath: window.location.pathname.slice(0, 200),
      referrerHost: referrerHost(),
      metadata,
    }),
  }).catch(() => undefined);
}

function isBookingLink(anchor: HTMLAnchorElement) {
  try {
    const url = new URL(anchor.href, window.location.href);
    return url.hostname === "calendar.google.com" && url.pathname.includes("appointments");
  } catch {
    return false;
  }
}

export function FirstPartyAnalytics() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/admin")) return;

    trackFirstPartyEvent("page_view");

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement) || !isBookingLink(anchor)) return;

      let destinationHost = "calendar.google.com";
      try {
        destinationHost = new URL(anchor.href, window.location.href).hostname;
      } catch {
        // Keep the generic destination host.
      }
      trackFirstPartyEvent("booking_clicked", { destinationHost });
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}
