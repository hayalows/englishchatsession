import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { analyticsDatabaseConfigured, analyticsQuery } from "../../../lib/analytics/neon";
import { createFixedWindowRateLimiter } from "../../../lib/security/rate-limit";

export const dynamic = "force-dynamic";

const EVENT_NAMES = new Set(["page_view", "scan_started", "engagement"]);
const SCAN_MODES = new Set(["all", "name"]);
const ENGAGEMENT_MILESTONES = new Set([10, 30, 60, 180]);
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const MAX_BODY_BYTES = 4_096;
const consumeRateLimit = createFixedWindowRateLimiter({
  limit: 120,
  windowMs: 10 * 60 * 1_000,
});

type IncomingEvent = {
  visitorId?: unknown;
  sessionId?: unknown;
  eventName?: unknown;
  pagePath?: unknown;
  referrerHost?: unknown;
  metadata?: unknown;
};

class PayloadTooLargeError extends Error {}

function noStore(body: object, status: number, headers: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function noStoreEmpty(status: number, headers: HeadersInit = {}) {
  return new NextResponse(null, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const result = text(value, maxLength);
  return result || null;
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

function safeMetadata(eventName: string, value: unknown) {
  if (eventName === "page_view") return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  if (eventName === "scan_started") {
    const scanMode = text(input.scanMode, 8);
    return SCAN_MODES.has(scanMode) ? { scanMode } : null;
  }

  if (eventName === "engagement") {
    const milestoneSeconds = input.milestoneSeconds;
    return typeof milestoneSeconds === "number"
      && Number.isInteger(milestoneSeconds)
      && ENGAGEMENT_MILESTONES.has(milestoneSeconds)
      ? { milestoneSeconds }
      : null;
  }

  return null;
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(value).digest("hex");
}

async function readLimitedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new PayloadTooLargeError();

  const reader = request.body?.getReader();
  if (!reader) return "";

  const bytes: number[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (bytes.length + value.byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    bytes.push(...value);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export async function POST(request: NextRequest) {
  const rateLimit = consumeRateLimit(clientKey(request));
  const rateHeaders = {
    "RateLimit-Limit": String(rateLimit.limit),
    "RateLimit-Remaining": String(rateLimit.remaining),
    "RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1_000)),
  };
  if (!rateLimit.allowed) {
    return noStore(
      { message: "Too many analytics events were received. Try again later." },
      429,
      { ...rateHeaders, "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1_000))) },
    );
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && contentType !== "application/json") {
    return noStore({ message: "Analytics events must use JSON." }, 415, rateHeaders);
  }

  let payload: IncomingEvent;
  try {
    payload = JSON.parse(await readLimitedBody(request)) as IncomingEvent;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return noStore({ message: "The request is too large." }, 413, rateHeaders);
    }
    return noStore({ message: "Invalid analytics event." }, 400, rateHeaders);
  }

  const visitorId = text(payload.visitorId, 80);
  const sessionId = text(payload.sessionId, 80);
  const eventName = text(payload.eventName, 40);
  const pagePath = text(payload.pagePath, 200);
  const metadata = safeMetadata(eventName, payload.metadata);

  if (
    !ID_PATTERN.test(visitorId)
    || !ID_PATTERN.test(sessionId)
    || !EVENT_NAMES.has(eventName)
    || pagePath !== "/"
    || metadata === null
  ) {
    return noStore({ message: "Invalid analytics event." }, 400, rateHeaders);
  }

  // The finder stays fully functional when analytics has not been provisioned.
  if (!analyticsDatabaseConfigured()) return noStoreEmpty(204, rateHeaders);

  const userAgent = request.headers.get("user-agent") ?? "";
  const country = nullableText(request.headers.get("x-vercel-ip-country"), 8);

  try {
    await analyticsQuery(
      `INSERT INTO analytics_events
        (visitor_id, session_id, event_name, page_path, referrer_host, country, device_type, browser, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        visitorId,
        sessionId,
        eventName,
        pagePath,
        nullableText(payload.referrerHost, 120),
        country,
        deviceType(userAgent),
        browserName(userAgent),
        JSON.stringify(metadata),
      ],
    );
  } catch {
    return noStore({ message: "Analytics storage is temporarily unavailable." }, 503, rateHeaders);
  }

  return noStoreEmpty(204, rateHeaders);
}
