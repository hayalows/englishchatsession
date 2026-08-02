import { earliestAvailableTime, openingGroup, type OpeningGroup } from "../result-presentation";

import {
  ADMIN_STATUS_LABELS,
  isAdminIssue,
  type AdminCalendarResult,
} from "./calendar-health";
import type { AdminAuditReport } from "./audit";

export type AdminHealthSummary = {
  listed: number;
  checked: number;
  notChecked: number;
  healthy: number;
  available: number;
  noOpenings: number;
  unavailable: number;
  temporary: number;
  recovered: number;
  thisWeek: number;
  nextWeek: number;
  later: number;
  earliestOpening?: {
    tutor: string | null;
    bookingUrl: string;
    value: string;
  };
};

export function getAdminHealthSummary(
  results: AdminCalendarResult[],
  listedCount: number,
  now = new Date(),
): AdminHealthSummary {
  const summary: AdminHealthSummary = {
    listed: Math.max(0, listedCount),
    checked: results.length,
    notChecked: Math.max(0, listedCount - results.length),
    healthy: 0,
    available: 0,
    noOpenings: 0,
    unavailable: 0,
    temporary: 0,
    recovered: results.filter((result) => result.recovered).length,
    thisWeek: 0,
    nextWeek: 0,
    later: 0,
  };

  for (const result of results) {
    if (result.status === "available") {
      summary.available += 1;
      summary.healthy += 1;
      const group = openingGroup(result.slotResult, now);
      if (group === "this_week") summary.thisWeek += 1;
      if (group === "next_week") summary.nextWeek += 1;
      if (group === "later") summary.later += 1;
      const earliest = earliestAvailableTime(result.slotResult);
      if (earliest && (!summary.earliestOpening || new Date(earliest).valueOf() < new Date(summary.earliestOpening.value).valueOf())) {
        summary.earliestOpening = {
          tutor: result.tutor,
          bookingUrl: result.bookingUrl,
          value: earliest,
        };
      }
    } else if (result.status === "no_openings") {
      summary.noOpenings += 1;
      summary.healthy += 1;
    } else if (result.status === "unavailable") {
      summary.unavailable += 1;
    } else {
      summary.temporary += 1;
    }
  }

  return summary;
}

export function markRecovered(
  current: AdminCalendarResult[],
  previous: AdminCalendarResult[],
) {
  const previousByUrl = new Map(previous.map((result) => [result.bookingUrl, result]));
  return current.map((result) => ({
    ...result,
    recovered: Boolean(previousByUrl.get(result.bookingUrl) && !isAdminIssue(result) && isAdminIssue(previousByUrl.get(result.bookingUrl)!)),
  }));
}

export function openingGroupLabel(group: OpeningGroup) {
  return group === "this_week" ? "this week" : group === "next_week" ? "next week" : "later";
}

function displayDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatAdminIssueReport(
  report: Pick<AdminAuditReport, "state" | "startedAt" | "finishedAt" | "listedCount" | "completedCount">,
  results: AdminCalendarResult[],
  summary = getAdminHealthSummary(results, report.listedCount),
) {
  const issues = results.filter(isAdminIssue);
  const lines = [
    "English Chat Finder calendar health",
    "",
    `${report.state === "complete" ? "Audit completed" : "Audit stopped"}: ${displayDateTime(report.finishedAt)}`,
    `${summary.listed} calendars listed`,
    `${report.completedCount} calendars checked`,
    `${summary.notChecked} calendars not checked`,
    `${summary.unavailable} unavailable when checked`,
    `${summary.temporary} temporary problems`,
    "",
  ];

  if (!issues.length) {
    lines.push("No calendar problems were found in this audit.");
    return lines.join("\n");
  }

  lines.push("CALENDARS REQUIRING ATTENTION", "");
  issues.forEach((issue, index) => {
    lines.push(
      `${index + 1}. ${issue.tutor ?? "English Chat volunteer"}`,
      `Status: ${ADMIN_STATUS_LABELS[issue.status]}`,
      `Calendar: ${issue.bookingUrl}`,
      `Last checked: ${displayDateTime(issue.checkedAt)}`,
      `Reason: ${issue.reasonLabel}`,
      `Retry: ${issue.retryAfter ? displayDateTime(issue.retryAfter) : "Next explicit audit"}`,
      "",
    );
  });

  return lines.join("\n").trimEnd();
}

export function findAuditedVolunteers(results: AdminCalendarResult[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  return results.filter((result) => (result.tutor ?? "English Chat volunteer").toLocaleLowerCase().includes(normalizedQuery));
}
