import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "english-chat-admin-session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const SESSION_VERSION = "v1";

function configuredPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload: string, password: string) {
  return createHmac("sha256", password).update(payload).digest("base64url");
}

export function isAdminConfigured() {
  return Boolean(configuredPassword());
}

export function adminPasswordsMatch(candidate: string) {
  const password = configuredPassword();
  return Boolean(password) && safeEqual(candidate, password);
}

export function createAdminSessionToken(now = Date.now()) {
  const password = configuredPassword();
  if (!password) return null;

  const expiresAt = Math.floor(now / 1_000) + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload = `${SESSION_VERSION}.${expiresAt}`;
  return `${payload}.${sign(payload, password)}`;
}

export function isValidAdminSessionToken(token: string | undefined, now = Date.now()) {
  const password = configuredPassword();
  if (!password || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_VERSION) return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1_000)) return false;

  const payload = `${parts[0]}.${parts[1]}`;
  return safeEqual(parts[2], sign(payload, password));
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export function clearedAdminSessionCookieOptions() {
  return {
    ...adminSessionCookieOptions(),
    maxAge: 0,
  };
}
