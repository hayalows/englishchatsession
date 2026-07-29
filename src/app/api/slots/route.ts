import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { checkBookingSlots, InvalidBookingUrlError } from "../../../lib/monitoring/slots";
import { createFixedWindowRateLimiter } from "../../../lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 2_048;
const MAX_BOOKING_URL_LENGTH = 2_048;
const consumeRateLimit = createFixedWindowRateLimiter({
  limit: 360,
  windowMs: 10 * 60 * 1_000,
});

function noStoreJson(body: object, status: number, headers: HeadersInit = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return noStoreJson({ message: "The request is too large." }, 413);
  }

  const rateLimit = consumeRateLimit(clientKey(request));
  const rateHeaders = {
    "RateLimit-Limit": String(rateLimit.limit),
    "RateLimit-Remaining": String(rateLimit.remaining),
    "RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1_000)),
  };
  if (!rateLimit.allowed) {
    return noStoreJson(
      { message: "Too many calendar checks were requested. Wait a moment and try again." },
      429,
      { ...rateHeaders, "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1_000))) },
    );
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return noStoreJson({ message: "The request is too large." }, 413, rateHeaders);
    }
    let body: { bookingUrl?: unknown };
    try {
      body = JSON.parse(rawBody) as { bookingUrl?: unknown };
    } catch {
      return noStoreJson({ message: "The request must contain valid JSON." }, 400, rateHeaders);
    }
    if (typeof body.bookingUrl !== "string" || !body.bookingUrl.trim()) {
      return noStoreJson({ message: "A booking URL is required." }, 400, rateHeaders);
    }
    if (body.bookingUrl.length > MAX_BOOKING_URL_LENGTH) {
      return noStoreJson({ message: "The booking URL is too long." }, 400, rateHeaders);
    }
    return NextResponse.json(await checkBookingSlots(body.bookingUrl, request.signal), {
      headers: { "Cache-Control": "no-store", ...rateHeaders },
    });
  } catch (error) {
    if (error instanceof InvalidBookingUrlError) {
      return noStoreJson({ message: error.message }, 400, rateHeaders);
    }
    if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return noStoreJson({ message: "The calendar check was stopped." }, 499, rateHeaders);
    }
    console.error("[api/slots] Unexpected calendar check failure", error instanceof Error ? error.message : String(error));
    return noStoreJson({ message: "Unable to check this booking page right now." }, 502, rateHeaders);
  }
}
