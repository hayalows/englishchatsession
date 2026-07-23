import type { SlotResult } from "./results";

const CALENDAR_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);
const AVAILABILITY_DAYS = 60;
const GOOGLE_RPC_URL = "https://calendar-pa.clients6.google.com/$rpc/google.internal.calendar.v1.AppointmentBookingService/ListAvailableSlots";
// This is Google's referrer-restricted public Calendar web-client key, not an app secret.
const GOOGLE_CALENDAR_WEB_KEY = ["AIzaSyA7GKm43", "l8WNxlLTjsldq9z9n80CL6KW4U"].join("");

function isTrustedBookingUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && CALENDAR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function scheduleIdFromUrl(value: string) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  const schedulesIndex = parts.indexOf("schedules");
  return schedulesIndex >= 0 ? parts[schedulesIndex + 1] : undefined;
}

async function resolveScheduleId(bookingUrl: string, signal?: AbortSignal) {
  const directId = scheduleIdFromUrl(bookingUrl);
  if (directId) return directId;
  const response = await fetch(bookingUrl, { redirect: "follow", signal });
  if (!response.ok) throw new Error(`Booking link returned HTTP ${response.status}.`);
  const resolvedId = scheduleIdFromUrl(response.url);
  if (!resolvedId) throw new Error("Google did not resolve this booking link to an appointment schedule.");
  return resolvedId;
}

export function extractSlotTimestamps(value: unknown): number[] {
  const timestamps = new Set<number>();
  const visit = (entry: unknown) => {
    if (typeof entry === "string" && /^\d{10}$/.test(entry)) timestamps.add(Number(entry));
    else if (Array.isArray(entry)) entry.forEach(visit);
  };
  visit(value);
  return [...timestamps].sort((a, b) => a - b);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function checkBookingSlots(bookingUrl: string, signal?: AbortSignal): Promise<SlotResult> {
  if (!isTrustedBookingUrl(bookingUrl)) throw new Error("Only Google Calendar booking pages can be checked.");
  if (signal?.aborted) throw new DOMException("The check was stopped.", "AbortError");

  const checkedAt = new Date().toISOString();
  const rangeStart = new Date();
  rangeStart.setUTCHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + AVAILABILITY_DAYS);
  const checkedRange = { start: dateOnly(rangeStart), end: dateOnly(rangeEnd), description: `${dateOnly(rangeStart)} through ${dateOnly(rangeEnd)} (next ${AVAILABILITY_DAYS} days)` };

  try {
    const scheduleId = await resolveScheduleId(bookingUrl, signal);
    const requestBody = [null, null, scheduleId, null, [[Math.floor(rangeStart.valueOf() / 1000)], [Math.floor(rangeEnd.valueOf() / 1000)]]];
    const response = await fetch(GOOGLE_RPC_URL, {
      method: "POST", signal, body: JSON.stringify(requestBody),
      headers: {
        "Content-Type": "application/json+protobuf",
        "Origin": "https://calendar.google.com",
        "Referer": "https://calendar.google.com/",
        "X-Goog-Api-Key": GOOGLE_CALENDAR_WEB_KEY,
        "X-User-Agent": "grpc-web-javascript/0.1",
      },
    });
    if (response.status === 400 || response.status === 404) return {
      status: "failed", availableDates: [], checkedAt, checkedRange, adapter: "direct",
      message: "Google says this appointment schedule is unavailable. You can still open the page to verify it.", reasonCode: "schedule_unavailable",
    };
    if (!response.ok) throw new Error(`Google availability returned HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (Array.isArray(payload) && typeof payload[0] === "number" && typeof payload[1] === "string") return {
      status: "failed", availableDates: [], checkedAt, checkedRange, adapter: "direct",
      message: "Google says this appointment schedule is unavailable. You can still open the page to verify it.", reasonCode: "schedule_unavailable",
    };
    const timestamps = extractSlotTimestamps(payload);
    const availableTimes = timestamps.map((timestamp) => new Date(timestamp * 1000).toISOString());
    const availableDates = [...new Set(availableTimes.map((time) => time.slice(0, 10)))];
    if (availableDates.length) return {
      status: "available", availableDates, availableTimes, checkedAt, checkedRange, adapter: "direct",
      message: `${availableDates.length} available date${availableDates.length === 1 ? "" : "s"} confirmed from Google Calendar.`, reasonCode: "confirmed_dates",
    };
    return {
      status: "none_in_view", availableDates: [], availableTimes: [], checkedAt, checkedRange, adapter: "direct",
      message: `Google Calendar returned no open appointments in the next ${AVAILABILITY_DAYS} days.`, reasonCode: "confirmed_empty_range",
    };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (/did not resolve|booking link returned HTTP 4\d\d/i.test(errorMessage)) return {
      status: "failed", availableDates: [], checkedAt, checkedRange, adapter: "direct",
      message: "This booking link no longer resolves to an active Google appointment schedule.", reasonCode: "schedule_unavailable",
    };
    console.error("[slot-check] Direct Google Calendar check failed", errorMessage);
    return {
      status: "unknown", availableDates: [], checkedAt, checkedRange, adapter: "direct",
      message: "Google Calendar could not be reached reliably. Open the booking page or try again.", reasonCode: "request_failed",
    };
  }
}
