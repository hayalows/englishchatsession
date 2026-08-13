import { NextResponse } from "next/server";

import { analyticsDatabaseConfigured, analyticsQuery } from "@/lib/analytics/neon";

const EVENT_NAMES = new Set(["page_view", "booking_clicked"]);
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const MAX_BODY_BYTES = 4_096;

type IncomingEvent = {
  visitorId?: unknown;
  sessionId?: unknown;
  eventName?: unknown;
  pagePath?: unknown;
  referrerHost?: unknown;
  metadata?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const result = text(value, maxLength);
  return result || null;
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(source).slice(0, 8)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) continue;
    if (typeof item === "boolean" || typeof item === "number") result[key] = item;
    if (typeof item === "string") result[key] = item.slice(0, 120);
  }
  return result;
}

function deviceType(userAgent: string) {
  if (/ipad|tablet|kindle/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function browserName(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\//i.test(userAgent)) return "Opera";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/chrome\//i.test(userAgent)) return "Chrome";
  if (/safari\//i.test(userAgent)) return "Safari";
  return "Other";
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ message: "Request too large." }, { status: 413 });

  let payload: IncomingEvent;
  try {
    payload = (await request.json()) as IncomingEvent;
  } catch {
    return NextResponse.json({ message: "Invalid analytics event." }, { status: 400 });
  }

  const visitorId = text(payload.visitorId, 80);
  const sessionId = text(payload.sessionId, 80);
  const eventName = text(payload.eventName, 40);
  const pagePath = text(payload.pagePath, 200) || "/";

  if (!ID_PATTERN.test(visitorId) || !ID_PATTERN.test(sessionId) || !EVENT_NAMES.has(eventName)) {
    return NextResponse.json({ message: "Invalid analytics event." }, { status: 400 });
  }

  if (!analyticsDatabaseConfigured()) return new NextResponse(null, { status: 204 });

  const userAgent = request.headers.get("user-agent") ?? "";
  const country = nullableText(request.headers.get("x-vercel-ip-country"), 8);
  const region = nullableText(request.headers.get("x-vercel-ip-country-region"), 80);
  const encodedCity = nullableText(request.headers.get("x-vercel-ip-city"), 120);
  let city = encodedCity;
  if (encodedCity) {
    try { city = decodeURIComponent(encodedCity); } catch { city = encodedCity; }
  }

  try {
    await analyticsQuery(
      `INSERT INTO analytics_events
        (visitor_id, session_id, event_name, page_path, referrer_host, country, region, city, device_type, browser, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
      [
        visitorId,
        sessionId,
        eventName,
        pagePath,
        nullableText(payload.referrerHost, 120),
        country,
        region,
        city,
        deviceType(userAgent),
        browserName(userAgent),
        JSON.stringify(safeMetadata(payload.metadata)),
      ],
    );
  } catch {
    return NextResponse.json({ message: "Analytics storage is temporarily unavailable." }, { status: 503 });
  }

  return new NextResponse(null, { status: 204 });
}
