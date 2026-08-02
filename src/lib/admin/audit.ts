import type { ProgressiveScanSnapshot } from "../progressive-scan";
import { runProgressiveScan } from "../progressive-scan";
import type { SlotResult } from "../monitoring/results";

import {
  classifySlotResult,
  createAdminProblem,
  type AdminBookingPage,
  type AdminCalendarResult,
} from "./calendar-health";

const ADMIN_CHECK_CONCURRENCY = 3;
const ADMIN_CHECK_TIMEOUT_MS = 35_000;

export type AdminAuditProgress = {
  completed: number;
  total: number;
  results: AdminCalendarResult[];
};

export type AdminAuditReport = {
  state: "complete" | "stopped";
  listedCount: number;
  completedCount: number;
  startedAt: string;
  finishedAt: string;
  results: AdminCalendarResult[];
  reduced: boolean;
};

function isSlotResult(value: unknown): value is SlotResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SlotResult>;
  return typeof candidate.status === "string"
    && Array.isArray(candidate.availableDates)
    && typeof candidate.message === "string";
}

function retryAfterFromResponse(response: Response) {
  const value = response.headers.get("Retry-After");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return new Date(Date.now() + Math.max(0, seconds) * 1_000).toISOString();
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : new Date(date).toISOString();
}

function responseMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && typeof (payload as { message?: unknown }).message === "string") {
    return (payload as { message: string }).message;
  }
  return fallback;
}

async function checkCalendar(page: AdminBookingPage, signal: AbortSignal): Promise<AdminCalendarResult> {
  const controller = new AbortController();
  const abortForParent = () => controller.abort();
  const timeout = globalThis.setTimeout(() => controller.abort(), ADMIN_CHECK_TIMEOUT_MS);
  signal.addEventListener("abort", abortForParent, { once: true });

  try {
    const response = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingUrl: page.bookingUrl }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    const checkedAt = new Date().toISOString();

    if (response.ok && isSlotResult(payload)) return classifySlotResult(page, payload);

    if (response.status === 400) {
      return createAdminProblem(page, {
        checkedAt,
        message: responseMessage(payload, "The booking URL was not a usable Google appointment schedule."),
        reasonCode: "schedule_unavailable",
      });
    }

    const reasonCode = response.status === 429
      ? "rate_limited"
      : response.status === 408 || response.status === 504
        ? "request_timeout"
        : "temporary_provider_failure";
    return createAdminProblem(page, {
      checkedAt,
      message: responseMessage(payload, "The calendar check did not return reliable availability."),
      reasonCode,
      retryAfter: retryAfterFromResponse(response),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    const timedOut = controller.signal.aborted;
    return createAdminProblem(page, {
      checkedAt: new Date().toISOString(),
      message: timedOut
        ? "The calendar check exceeded the administrator audit timeout."
        : "The network or Google provider did not return reliable availability.",
      reasonCode: timedOut ? "request_timeout" : "temporary_provider_failure",
    });
  } finally {
    globalThis.clearTimeout(timeout);
    signal.removeEventListener("abort", abortForParent);
  }
}

function progressFromSnapshot(
  snapshot: ProgressiveScanSnapshot<AdminBookingPage>,
  results: Map<string, AdminCalendarResult>,
): AdminAuditProgress {
  return {
    completed: snapshot.completed,
    total: snapshot.total,
    results: [...results.values()],
  };
}

export async function runAdminHealthAudit(
  pages: AdminBookingPage[],
  options: {
    signal: AbortSignal;
    onProgress?: (progress: AdminAuditProgress) => void;
  },
): Promise<AdminAuditReport> {
  const startedAt = new Date().toISOString();
  const results = new Map<string, AdminCalendarResult>();
  const emit = (snapshot: ProgressiveScanSnapshot<AdminBookingPage>) => options.onProgress?.(progressFromSnapshot(snapshot, results));

  const summary = await runProgressiveScan({
    items: pages,
    concurrency: ADMIN_CHECK_CONCURRENCY,
    minimumConcurrency: 1,
    signal: options.signal,
    run: (page, signal) => checkCalendar(page, signal),
    isRateLimited: (result) => result.reasonCode === "rate_limited",
    isTemporaryFailure: (result) => result.status === "temporary",
    onResult: (page, result) => {
      results.set(page.bookingUrl, result);
    },
    onProgress: emit,
  });

  const finishedAt = new Date().toISOString();
  return {
    state: summary.stopped ? "stopped" : "complete",
    listedCount: pages.length,
    completedCount: summary.completed,
    startedAt,
    finishedAt,
    results: [...results.values()],
    reduced: summary.reduced,
  };
}
