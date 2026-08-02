import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_SESSION_COOKIE,
  adminPasswordsMatch,
  adminSessionCookieOptions,
  createAdminSessionToken,
  isAdminConfigured,
} from "../../../../lib/admin/auth";
import { createFixedWindowRateLimiter } from "../../../../lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_024;
const loginRateLimit = createFixedWindowRateLimiter({ limit: 8, windowMs: 10 * 60 * 1_000 });

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
  if (!isAdminConfigured()) {
    return noStoreJson({ message: "Administrator access is not configured yet." }, 503);
  }

  const rateLimit = loginRateLimit(clientKey(request));
  if (!rateLimit.allowed) {
    return noStoreJson(
      { message: "Too many sign-in attempts. Try again later." },
      429,
      { "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1_000))) },
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return noStoreJson({ message: "The sign-in request is too large." }, 413);
  }

  let body: { password?: unknown };
  try {
    body = JSON.parse(rawBody) as { password?: unknown };
  } catch {
    return noStoreJson({ message: "The sign-in request must contain valid JSON." }, 400);
  }

  if (typeof body.password !== "string" || !adminPasswordsMatch(body.password)) {
    return noStoreJson({ message: "The administrator password is incorrect." }, 401);
  }

  const token = createAdminSessionToken();
  if (!token) return noStoreJson({ message: "Administrator access is not configured yet." }, 503);

  const response = noStoreJson({ ok: true }, 200);
  response.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions());
  return response;
}
