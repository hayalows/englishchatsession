import type { SlotResult } from "../monitoring/results";

export type AdminCalendarStatus = "available" | "no_openings" | "unavailable" | "temporary";
export type AdminProblemKind = "unavailable" | "temporary";
export type AdminReasonCode =
  | "confirmed_dates"
  | "confirmed_empty_range"
  | "schedule_unavailable"
  | "request_timeout"
  | "rate_limited"
  | "temporary_provider_failure"
  | "request_failed";

export type AdminBookingPage = {
  tutor: string | null;
  bookingUrl: string;
};

export type AdminCalendarResult = AdminBookingPage & {
  status: AdminCalendarStatus;
  problemKind?: AdminProblemKind;
  reasonCode?: AdminReasonCode;
  reasonLabel: string;
  message: string;
  checkedAt: string;
  checkedRange?: SlotResult["checkedRange"];
  slotResult?: SlotResult;
  retryAfter?: string;
  recovered?: boolean;
};

export type AdminIssueFilter = "all" | "unavailable" | "temporary";

export const ADMIN_STATUS_LABELS: Record<AdminCalendarStatus, string> = {
  available: "Confirmed availability",
  no_openings: "No openings in checked range",
  unavailable: "Calendar unavailable when checked",
  temporary: "Temporary check problem",
};

export const ADMIN_REASON_LABELS: Record<AdminReasonCode, string> = {
  confirmed_dates: "Google returned confirmed appointment times",
  confirmed_empty_range: "Google returned no opening in the checked range",
  schedule_unavailable: "Schedule unavailable",
  request_timeout: "Google check timed out",
  rate_limited: "Google temporarily limited requests",
  temporary_provider_failure: "Temporary Google/provider problem",
  request_failed: "Request failed before availability could be confirmed",
};

export function classifySlotResult(page: AdminBookingPage, result: SlotResult): AdminCalendarResult {
  const checkedAt = result.checkedAt ?? new Date().toISOString();
  if (result.status === "available" && result.reasonCode === "confirmed_dates") {
    return {
      ...page,
      status: "available",
      reasonCode: "confirmed_dates",
      reasonLabel: ADMIN_REASON_LABELS.confirmed_dates,
      message: result.message,
      checkedAt,
      checkedRange: result.checkedRange,
      slotResult: result,
    };
  }

  if (result.status === "none_in_view" && result.reasonCode === "confirmed_empty_range") {
    return {
      ...page,
      status: "no_openings",
      reasonCode: "confirmed_empty_range",
      reasonLabel: ADMIN_REASON_LABELS.confirmed_empty_range,
      message: result.message,
      checkedAt,
      checkedRange: result.checkedRange,
      slotResult: result,
    };
  }

  if (result.reasonCode === "schedule_unavailable") {
    return {
      ...page,
      status: "unavailable",
      problemKind: "unavailable",
      reasonCode: "schedule_unavailable",
      reasonLabel: ADMIN_REASON_LABELS.schedule_unavailable,
      message: result.message,
      checkedAt,
      checkedRange: result.checkedRange,
      slotResult: result,
    };
  }

  const reasonCode: AdminReasonCode = "request_failed";
  return {
    ...page,
    status: "temporary",
    problemKind: "temporary",
    reasonCode,
    reasonLabel: ADMIN_REASON_LABELS[reasonCode],
    message: result.message,
    checkedAt,
    checkedRange: result.checkedRange,
    slotResult: result,
  };
}

export function createAdminProblem(
  page: AdminBookingPage,
  options: {
    checkedAt?: string;
    message: string;
    reasonCode: Exclude<AdminReasonCode, "confirmed_dates" | "confirmed_empty_range">;
    retryAfter?: string;
  },
): AdminCalendarResult {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const unavailable = options.reasonCode === "schedule_unavailable";
  return {
    ...page,
    status: unavailable ? "unavailable" : "temporary",
    problemKind: unavailable ? "unavailable" : "temporary",
    reasonCode: options.reasonCode,
    reasonLabel: ADMIN_REASON_LABELS[options.reasonCode],
    message: options.message,
    checkedAt,
    retryAfter: options.retryAfter,
  };
}

export function isAdminIssue(result: AdminCalendarResult) {
  return result.status === "unavailable" || result.status === "temporary";
}

export function filterAdminIssues(
  results: AdminCalendarResult[],
  filter: AdminIssueFilter,
  query = "",
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return results.filter((result) => {
    if (!isAdminIssue(result)) return false;
    if (filter !== "all" && result.problemKind !== filter) return false;
    if (!normalizedQuery) return true;
    return (result.tutor ?? "English Chat volunteer").toLocaleLowerCase().includes(normalizedQuery);
  });
}
