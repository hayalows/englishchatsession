"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CopyIconButton } from "@/components/copy-icon-button";
import {
  filterAdminIssues,
  ADMIN_STATUS_LABELS,
  type AdminCalendarResult,
  type AdminIssueFilter,
} from "@/lib/admin/calendar-health";
import {
  runAdminHealthAudit,
  type AdminAuditReport,
  type AdminAuditProgress,
} from "@/lib/admin/audit";
import {
  findAuditedVolunteers,
  formatAdminIssueReport,
  getAdminHealthSummary,
  markRecovered,
} from "@/lib/admin/calendar-health-report";
import { earliestAvailableTime, openingGroup, type OpeningGroup } from "@/lib/result-presentation";

import styles from "@/app/admin/admin.module.css";

const ADMIN_AUDIT_STORAGE_KEY = "english-chat-admin-audit:v1";
const OFFICIAL_SCHEDULE = "https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0";
const PREPARE_PAGE = "https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0";

type AuditState = "idle" | "running" | "complete" | "stopped" | "error";
type AdminView = "overview" | "availability" | "issues" | "volunteers";
type AvailabilityFilter = "all" | OpeningGroup;
type StoredAudit = { completedAt: string; listedCount: number; results: AdminCalendarResult[] };

const ADMIN_VIEWS: ReadonlyArray<{ id: AdminView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "availability", label: "Availability" },
  { id: "issues", label: "Issues" },
  { id: "volunteers", label: "Volunteers" },
];

const AVAILABILITY_FILTERS: ReadonlyArray<{ id: AvailabilityFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "this_week", label: "This week" },
  { id: "next_week", label: "Next week" },
  { id: "later", label: "Later" },
];

function displayDateTime(value?: string) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Not checked yet"
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function displayOpening(value?: string | null) {
  if (!value) return "No confirmed time";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

function resultStatusClass(status: AdminCalendarResult["status"]) {
  if (status === "available") return styles.statusAvailable;
  if (status === "no_openings") return styles.statusHealthy;
  if (status === "unavailable") return styles.statusUnavailable;
  return styles.statusTemporary;
}

function issueCount(results: AdminCalendarResult[], filter: AdminIssueFilter) {
  return filterAdminIssues(results, filter).length;
}

function readPreviousAudit() {
  try {
    const value = JSON.parse(localStorage.getItem(ADMIN_AUDIT_STORAGE_KEY) ?? "null") as StoredAudit | null;
    if (!value || !Array.isArray(value.results) || typeof value.listedCount !== "number") return [];
    return value.results;
  } catch {
    return [];
  }
}

async function copyReportText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy was not confirmed.");
}

function CalendarActions({ result }: { result: AdminCalendarResult }) {
  const calendarName = result.tutor ?? "English Chat volunteer";
  return (
    <div aria-label={`${calendarName} actions`} className={styles.issueActions}>
      <a href={result.bookingUrl} rel="noreferrer" target="_blank">
        Open Google <span aria-hidden="true">↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <CopyIconButton bookingUrl={result.bookingUrl} calendarName={calendarName} showLabel />
    </div>
  );
}

function AvailabilityCard({ result }: { result: AdminCalendarResult }) {
  const calendarName = result.tutor ?? "English Chat volunteer";
  return (
    <article className={styles.availabilityCard}>
      <div>
        <div className={styles.issueTitle}>
          <h3>{calendarName}</h3>
          <span className={styles.statusPill + " " + styles.statusAvailable}>Open</span>
        </div>
        <p>Earliest: {displayOpening(earliestAvailableTime(result.slotResult))}</p>
        <small>Checked {displayDateTime(result.checkedAt)}</small>
      </div>
      <CalendarActions result={result} />
    </article>
  );
}

function IssueCard({ issue, compact = false }: { issue: AdminCalendarResult; compact?: boolean }) {
  return (
    <article className={styles.issueCard + (compact ? " " + styles.issueCardCompact : "")}>
      <div className={styles.issueCopy}>
        <div className={styles.issueTitle}>
          <h3>{issue.tutor ?? "English Chat volunteer"}</h3>
          <span className={styles.statusPill + " " + resultStatusClass(issue.status)}>{ADMIN_STATUS_LABELS[issue.status]}</span>
        </div>
        <p>{issue.reasonLabel}</p>
        <small>
          Checked {displayDateTime(issue.checkedAt)}
          {compact ? "" : " · Retry " + (issue.retryAfter ? displayDateTime(issue.retryAfter) : "with the next audit")}
        </small>
      </div>
      {!compact ? <CalendarActions result={issue} /> : null}
    </article>
  );
}

function AuditRequiredNotice({ onRun }: { onRun: () => void }) {
  return (
    <section className={styles.auditRequired} aria-labelledby="audit-required-title">
      <div>
        <p className={styles.eyebrow}>Start with one check</p>
        <h2 id="audit-required-title">Run an audit to fill the dashboard.</h2>
        <p>Openings, issues, and volunteer status will appear here from the same current results.</p>
      </div>
      <button className={styles.primaryButton} onClick={onRun} type="button">Run calendar audit</button>
    </section>
  );
}

type VolunteerLookupProps = {
  activeResults: AdminCalendarResult[];
  compact?: boolean;
  hasAudit: boolean;
  lookupQuery: string;
  onOpenFull?: () => void;
  selected: AdminCalendarResult | undefined;
  setLookupQuery: (value: string) => void;
  setSelectedUrl: (value: string) => void;
};

function VolunteerLookup({
  activeResults,
  compact = false,
  hasAudit,
  lookupQuery,
  onOpenFull,
  selected,
  setLookupQuery,
  setSelectedUrl,
}: VolunteerLookupProps) {
  const lookupMatches = useMemo(
    () => findAuditedVolunteers(activeResults, lookupQuery).slice(0, compact ? 4 : 8),
    [activeResults, compact, lookupQuery],
  );
  const titleId = compact ? "quick-lookup-title" : "volunteer-lookup-title";

  return (
    <section className={compact ? styles.lookupPreview : styles.section} aria-labelledby={titleId}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>{compact ? "Quick lookup" : "Volunteer status"}</p>
          <h2 id={titleId}>Find a volunteer</h2>
          <p>{compact ? "Search the results from this audit." : "Find a volunteer in the current audit. Searching here does not run another calendar check."}</p>
        </div>
      </div>
      {!hasAudit ? (
        <p className={styles.emptyNotice}>Run an audit first, then search any volunteer by name.</p>
      ) : (
        <>
          <label className={styles.lookupField}>
            <span>Volunteer name</span>
            <input
              aria-describedby={titleId + "-help"}
              onChange={(event) => setLookupQuery(event.target.value)}
              placeholder="Start typing a name"
              type="search"
              value={lookupQuery}
            />
          </label>
          <span className="sr-only" id={titleId + "-help"}>Results come from the current browser audit only.</span>
          {lookupQuery.trim() && lookupMatches.length ? (
            <div className={styles.lookupMatches} role="listbox" aria-label="Audited volunteer matches">
              {lookupMatches.map((result) => (
                <button
                  aria-selected={selected?.bookingUrl === result.bookingUrl}
                  key={result.bookingUrl}
                  onClick={() => setSelectedUrl(result.bookingUrl)}
                  role="option"
                  type="button"
                >
                  <strong>{result.tutor ?? "English Chat volunteer"}</strong>
                  <span>{ADMIN_STATUS_LABELS[result.status]}</span>
                </button>
              ))}
            </div>
          ) : null}
          {lookupQuery.trim() && !lookupMatches.length ? <p className={styles.emptyNotice}>No audited volunteer matches that name.</p> : null}
          {selected ? (
            <article className={styles.lookupDetail}>
              <div>
                <div className={styles.issueTitle}>
                  <h3>{selected.tutor ?? "English Chat volunteer"}</h3>
                  <span className={styles.statusPill + " " + resultStatusClass(selected.status)}>{ADMIN_STATUS_LABELS[selected.status]}</span>
                </div>
                {selected.status === "available" ? <p className={styles.lookupOpening}>Earliest opening: {displayOpening(earliestAvailableTime(selected.slotResult))}</p> : null}
                <p>{selected.reasonLabel}</p>
                <small>Checked {displayDateTime(selected.checkedAt)}</small>
              </div>
              <CalendarActions result={selected} />
            </article>
          ) : null}
          {compact ? <button className={styles.textButton} onClick={onOpenFull} type="button">Open volunteer lookup</button> : null}
        </>
      )}
    </section>
  );
}

export function AdminDashboard({ appVersion }: { appVersion: string }) {
  const [auditState, setAuditState] = useState<AuditState>("idle");
  const [audit, setAudit] = useState<AdminAuditReport | null>(null);
  const [progress, setProgress] = useState<AdminAuditProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<AdminView>("overview");
  const [issueFilter, setIssueFilter] = useState<AdminIssueFilter>("all");
  const [issueQuery, setIssueQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [lookupQuery, setLookupQuery] = useState("");
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const previousResultsRef = useRef<AdminCalendarResult[]>([]);

  useEffect(() => {
    previousResultsRef.current = readPreviousAudit();
  }, []);

  const activeResults = audit?.results ?? progress?.results ?? [];
  const listedCount = audit?.listedCount ?? progress?.total ?? 0;
  const summary = useMemo(() => getAdminHealthSummary(activeResults, listedCount), [activeResults, listedCount]);
  const allIssues = useMemo(() => filterAdminIssues(activeResults, "all"), [activeResults]);
  const issues = useMemo(() => filterAdminIssues(activeResults, issueFilter, issueQuery), [activeResults, issueFilter, issueQuery]);
  const recovered = useMemo(() => activeResults.filter((result) => result.recovered), [activeResults]);
  const available = useMemo(
    () => activeResults
      .filter((result) => result.status === "available")
      .sort((left, right) => {
        const leftOpening = earliestAvailableTime(left.slotResult);
        const rightOpening = earliestAvailableTime(right.slotResult);
        return (rightOpening ? 1 : 0) - (leftOpening ? 1 : 0)
          || (leftOpening ?? "").localeCompare(rightOpening ?? "");
      }),
    [activeResults],
  );
  const availabilityGroups = useMemo(() => {
    const groups: Record<AvailabilityFilter, AdminCalendarResult[]> = {
      all: available,
      this_week: [],
      next_week: [],
      later: [],
    };
    const now = new Date();
    available.forEach((result) => {
      const group = openingGroup(result.slotResult, now);
      if (group) groups[group].push(result);
    });
    return groups;
  }, [available]);
  const visibleAvailability = availabilityGroups[availabilityFilter];
  const selected = selectedUrl ? activeResults.find((result) => result.bookingUrl === selectedUrl) : undefined;
  const overviewAvailable = available.slice(0, 3);
  const overviewIssues = allIssues.slice(0, 3);
  const attentionCount = summary.unavailable + summary.temporary;
  const progressTotal = progress?.total ?? 0;
  const progressCompleted = progress?.completed ?? 0;
  const progressPercent = progressTotal ? Math.min(100, Math.round((progressCompleted / progressTotal) * 100)) : 0;
  const hasAudit = Boolean(audit || progress);
  const auditTimestamp = audit
    ? "Updated " + displayDateTime(audit.finishedAt)
    : auditState === "running"
      ? "Audit in progress"
      : "No audit run yet";
  const auditActionLabel = auditState === "running" ? "Audit running" : hasAudit ? "Refresh audit" : "Run calendar audit";
  const summaryValue = (value: number) => hasAudit ? value : "Not run";

  async function runAudit() {
    if (auditState === "running") return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setAuditState("running");
    setAudit(null);
    setProgress(null);
    setMessage(null);
    setSelectedUrl(null);
    setIssueFilter("all");
    setIssueQuery("");
    setAvailabilityFilter("all");
    setReportCopied(false);
    setView("overview");

    try {
      const response = await fetch("/api/availability", { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as { bookingPages?: unknown; message?: unknown };
      if (!response.ok || !Array.isArray(payload.bookingPages)) {
        throw new Error(typeof payload.message === "string" ? payload.message : "Unable to read the official volunteer calendar list.");
      }
      const pages = payload.bookingPages.filter((page): page is { tutor: string | null; bookingUrl: string } => Boolean(
        page
        && typeof page === "object"
        && typeof (page as { bookingUrl?: unknown }).bookingUrl === "string",
      ));
      setProgress({ completed: 0, total: pages.length, results: [] });
      const report = await runAdminHealthAudit(pages, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      const recoveredResults = markRecovered(report.results, previousResultsRef.current);
      const finalReport = { ...report, results: recoveredResults };
      setAudit(finalReport);
      setProgress({ completed: report.completedCount, total: report.listedCount, results: recoveredResults });
      setAuditState(report.state);
      previousResultsRef.current = recoveredResults;
      try {
        localStorage.setItem(ADMIN_AUDIT_STORAGE_KEY, JSON.stringify({
          completedAt: report.finishedAt,
          listedCount: report.listedCount,
          results: recoveredResults,
        } satisfies StoredAudit));
      } catch {
        // Admin audit state is useful but does not need to survive storage failures.
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setAuditState("stopped");
        setMessage("The audit was stopped before the calendar list finished loading.");
      } else {
        setAuditState("error");
        setMessage(error instanceof Error ? error.message : "The calendar audit could not be completed.");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function stopAudit() {
    controllerRef.current?.abort();
  }

  async function copyIssueReport() {
    if (!audit) return;
    try {
      await copyReportText(formatAdminIssueReport(audit, audit.results, getAdminHealthSummary(audit.results, audit.listedCount)));
      setReportCopied(true);
      window.setTimeout(() => setReportCopied(false), 1_800);
    } catch {
      setMessage("The issue report could not be copied. Select the issue details manually instead.");
    }
  }

  return (
    <main className={styles.adminShell}>
      <header className={styles.adminHeader}>
        <div>
          <p className={styles.eyebrow}>Administrator console</p>
          <h1>Calendar operations</h1>
          <p>See what is open, what needs review, and where to go next.</p>
        </div>
      </header>

      {view === "overview" ? (
        <section className={styles.statusPanel} aria-labelledby="system-status-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Calendar status</p>
          <h2 id="system-status-title">Current calendar picture</h2>
          <p>One audit shows openings, successful checks, and calendars that need review.</p>
            </div>
            <div className={styles.statusAction}>
              <span>{auditTimestamp}</span>
              <button className={styles.primaryButton} disabled={auditState === "running"} onClick={() => void runAudit()} type="button">
                {auditActionLabel}
              </button>
            </div>
          </div>
          <div className={styles.summaryGrid}>
            <button
              aria-label={hasAudit ? `View ${summary.available} confirmed openings` : "Run an audit to see confirmed openings"}
              className={styles.summaryCard + " " + styles.summaryCardAction + " " + styles.summaryCardAvailable}
              onClick={() => setView("availability")}
              type="button"
            >
              <span className={styles.summaryCardLabel}>Available now</span>
              <strong className={hasAudit ? undefined : styles.summaryValuePending}>{summaryValue(summary.available)}</strong>
              <span>Confirmed openings</span>
              <small>See openings <span aria-hidden="true">→</span></small>
            </button>
            <button
              aria-label={hasAudit ? `Review ${attentionCount} calendars needing attention` : "Run an audit to see calendars needing attention"}
              className={styles.summaryCard + " " + styles.summaryCardAction + " " + styles.summaryCardAttention}
              onClick={() => setView("issues")}
              type="button"
            >
              <span className={styles.summaryCardLabel}>Needs attention</span>
              <strong className={hasAudit ? undefined : styles.summaryValuePending}>{summaryValue(attentionCount)}</strong>
              <span>{hasAudit ? summary.unavailable + " unavailable · " + summary.temporary + " temporary" : "Unavailable · temporary"}</span>
              <small>Review calendars <span aria-hidden="true">→</span></small>
            </button>
            <article className={styles.summaryCard + " " + styles.summaryCardChecked}>
              <span className={styles.summaryCardLabel}>Checked successfully</span>
              <strong className={hasAudit ? undefined : styles.summaryValuePending}>{summaryValue(summary.healthy)}</strong>
              <span>{hasAudit ? summary.available + " open · " + summary.noOpenings + " no openings" : "Open · no openings"}</span>
            </article>
            <article className={styles.summaryCard + " " + styles.summaryCardTotal}>
              <span className={styles.summaryCardLabel}>Calendars listed</span>
              <strong className={hasAudit ? undefined : styles.summaryValuePending}>{summaryValue(summary.listed)}</strong>
              <span>Official volunteer list</span>
            </article>
          </div>
          {!hasAudit ? <p className={styles.emptyNotice}>No audit yet. Run one calendar check to fill in the current picture.</p> : null}
        </section>
      ) : null}

      <nav className={styles.taskNav} aria-label="Admin views">
        <div className={styles.taskNavInner}>
          {ADMIN_VIEWS.map((item) => {
            const count = item.id === "availability"
              ? hasAudit ? summary.available : null
              : item.id === "issues"
                ? hasAudit ? attentionCount : null
                : null;
            return (
              <button
                aria-label={item.label + (count === null ? "" : ", " + count)}
                aria-pressed={view === item.id}
                className={styles.taskButton + (view === item.id ? " " + styles.taskButtonActive : "")}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <span>{item.label}</span>
                {count !== null ? <b>{count}</b> : null}
              </button>
            );
          })}
        </div>
      </nav>

      {view !== "overview" && hasAudit ? (
        <section className={styles.completionPanel} aria-label="Current audit status">
          <div>
            <p className={styles.eyebrow}>Audit status</p>
            <p>{auditTimestamp}</p>
          </div>
          <button className={styles.secondaryButton} disabled={auditState === "running"} onClick={() => void runAudit()} type="button">{auditActionLabel}</button>
        </section>
      ) : null}

      {auditState === "running" && progress ? (
        <section className={styles.progressPanel} aria-live="polite" aria-labelledby="audit-progress-title">
          <div className={styles.progressHeading}>
            <div><p className={styles.eyebrow}>Live audit</p><h2 id="audit-progress-title">Checking calendars</h2></div>
            <strong>{progressCompleted} of {progressTotal}</strong>
          </div>
          <progress max={progressTotal || 1} value={progressCompleted}>{progressPercent}%</progress>
          <div className={styles.progressMeta}>
            <span>{progressPercent}% complete</span>
            <span>{summary.available} open · {summary.noOpenings} no openings · {attentionCount} need attention</span>
          </div>
          <button className={styles.stopButton} onClick={stopAudit} type="button">Stop audit</button>
        </section>
      ) : null}

      {message ? <p className={styles.alert} role="alert">{message}</p> : null}

      {view === "overview" ? (
        <div className={styles.viewStack}>
          {audit && auditState === "complete" ? (
            <section className={styles.completionPanel} aria-live="polite" aria-labelledby="audit-complete-title">
              <div>
                <p className={styles.eyebrow}>Audit complete</p>
                <h2 id="audit-complete-title">Audit results are ready.</h2>
                <p>{audit.completedCount} calendars checked. {summary.available} open. {attentionCount} need review.</p>
              </div>
              <div className={styles.completionActions}>
                <button className={styles.primaryButton} onClick={() => setView("availability")} type="button">See openings</button>
                <button className={styles.secondaryButton} onClick={() => setView("issues")} type="button">Review issues</button>
              </div>
            </section>
          ) : null}

          {audit && auditState === "stopped" ? (
            <section className={styles.completionPanel + " " + styles.completionStopped} aria-live="polite" aria-labelledby="audit-stopped-title">
              <div>
                <p className={styles.eyebrow}>Audit stopped</p>
                <h2 id="audit-stopped-title">Partial results are available.</h2>
                <p>{audit.completedCount} of {audit.listedCount} calendars checked. {summary.available} open. {attentionCount} need review.</p>
              </div>
              <button className={styles.secondaryButton} onClick={() => void runAudit()} type="button">Run another audit</button>
            </section>
          ) : null}

          {!hasAudit ? (
            <section className={styles.auditRequired} aria-labelledby="pre-audit-title">
              <div>
                <p className={styles.eyebrow}>Start here</p>
                <h2 id="pre-audit-title">Get the current calendar picture.</h2>
                <p>One audit checks the official volunteer list and sorts the results into openings, no openings, and calendars that need review.</p>
                <ul className={styles.auditSteps}>
                  <li>See confirmed openings as they appear</li>
                  <li>Separate no openings from problems</li>
                  <li>Find any volunteer from these results</li>
                </ul>
              </div>
              <button className={styles.primaryButton} onClick={() => void runAudit()} type="button">Run calendar audit</button>
            </section>
          ) : (
            <>
              <div className={styles.previewGrid}>
                <section className={styles.section} aria-labelledby="availability-preview-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Current availability</p>
                      <h2 id="availability-preview-title">Availability</h2>
                      <p>{summary.available} volunteer{summary.available === 1 ? "" : "s"} with a confirmed opening.</p>
                    </div>
                      <button className={styles.textButton} onClick={() => setView("availability")} type="button">See all availability</button>
                  </div>
                  {overviewAvailable.length ? (
                    <div className={styles.availabilityList}>
                      {overviewAvailable.map((result) => <AvailabilityCard key={result.bookingUrl} result={result} />)}
                    </div>
                  ) : (
                    <p className={styles.emptyNotice}>{auditState === "running" ? "No confirmed openings found yet." : "No confirmed openings were found in this audit."}</p>
                  )}
                </section>

                <section className={styles.section} aria-labelledby="issues-preview-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Needs review</p>
                      <h2 id="issues-preview-title">{attentionCount} calendar{attentionCount === 1 ? "" : "s"}</h2>
                      <p>{summary.unavailable} unavailable. {summary.temporary} temporary.</p>
                    </div>
                    <button className={styles.secondaryButton} disabled={!allIssues.length} onClick={() => setView("issues")} type="button">Review all</button>
                  </div>
                  {overviewIssues.length ? (
                    <div className={styles.issueList}>
                      {overviewIssues.map((issue) => <IssueCard compact key={issue.bookingUrl} issue={issue} />)}
                    </div>
                  ) : (
                    <p className={styles.emptyNotice}>{auditState === "running" ? "No calendar problems found yet." : "No calendars need attention in this audit."}</p>
                  )}
                </section>
              </div>

              {recovered.length ? (
                <section className={styles.recoveredPanel} aria-labelledby="recovered-title">
                  <div>
                    <p className={styles.eyebrow}>Since previous audit</p>
                    <h2 id="recovered-title">{recovered.length} calendar{recovered.length === 1 ? "" : "s"} recovered</h2>
                    <p>These calendars are working again. This comparison uses the previous audit saved in this browser.</p>
                  </div>
                  <ul>{recovered.map((result) => <li key={result.bookingUrl}><strong>{result.tutor ?? "English Chat volunteer"}</strong><span>{ADMIN_STATUS_LABELS[result.status]}</span></li>)}</ul>
                </section>
              ) : null}

              <VolunteerLookup
                activeResults={activeResults}
                compact
                hasAudit={hasAudit}
                lookupQuery={lookupQuery}
                onOpenFull={() => setView("volunteers")}
                selected={selected}
                setLookupQuery={setLookupQuery}
                setSelectedUrl={setSelectedUrl}
              />
            </>
          )}

          <details className={styles.referenceCard}>
            <summary>Help and reference</summary>
            <div className={styles.policyCopy}>
              <p><strong>Open:</strong> Google returned at least one bookable appointment time.</p>
              <p><strong>No openings:</strong> the calendar checked successfully but had no appointment time in the checked range.</p>
              <p><strong>Unavailable:</strong> the appointment schedule could not be used when it was checked.</p>
              <p><strong>Temporary problem:</strong> Google or the network did not return a reliable answer. Try again on a later audit.</p>
            </div>
            <dl>
              <div><dt>Application version</dt><dd>{appVersion}</dd></div>
              <div><dt>Calendars listed</dt><dd>{hasAudit ? summary.listed : "Run an audit"}</dd></div>
              <div><dt>Availability source</dt><dd>Google Calendar appointment schedules</dd></div>
            </dl>
            <nav>
              <a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Open official schedule ↗<span className="sr-only"> (opens in a new tab)</span></a>
              <a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Open preparation guide ↗<span className="sr-only"> (opens in a new tab)</span></a>
            </nav>
          </details>
        </div>
      ) : null}

      {view === "availability" ? (
        hasAudit ? (
          <section className={styles.section} aria-labelledby="availability-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Confirmed availability</p>
                <h2 id="availability-title">Availability</h2>
                <p>Earliest opening first. These volunteers have a bookable time in this audit.</p>
              </div>
              <strong className={styles.viewCount}>{summary.available} volunteer{summary.available === 1 ? "" : "s"}</strong>
            </div>
            <div className={styles.availabilitySummary}>
              <strong>{summary.available} volunteer{summary.available === 1 ? "" : "s"} ready to book</strong>
              <span>{summary.thisWeek} this week, {summary.nextWeek} next week, {summary.later} later</span>
            </div>
            <div className={styles.filterRow} aria-label="Filter confirmed openings">
              {AVAILABILITY_FILTERS.map((filter) => (
                <button
                  aria-pressed={availabilityFilter === filter.id}
                  className={availabilityFilter === filter.id ? styles.filterActive : styles.filterButton}
                  key={filter.id}
                  onClick={() => setAvailabilityFilter(filter.id)}
                  type="button"
                >
                  {filter.label}
                  <b>{filter.id === "all" ? available.length : availabilityGroups[filter.id].length}</b>
                </button>
              ))}
            </div>
            {visibleAvailability.length ? (
              <div className={styles.availabilityList}>
                {visibleAvailability.map((result) => <AvailabilityCard key={result.bookingUrl} result={result} />)}
              </div>
            ) : (
              <p className={styles.emptyNotice}>No confirmed openings in this time window.</p>
            )}
          </section>
        ) : <AuditRequiredNotice onRun={() => void runAudit()} />
      ) : null}

      {view === "issues" ? (
        hasAudit ? (
          <section className={styles.section} aria-labelledby="issues-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Needs review</p>
                <h2 id="issues-title">Issues to review</h2>
                <p>{attentionCount} calendar{attentionCount === 1 ? "" : "s"} need review. Unavailable calendars need checking. Temporary problems may clear on a later audit.</p>
              </div>
              <button className={styles.secondaryButton} disabled={!audit} onClick={() => void copyIssueReport()} type="button">{reportCopied ? "Issue report copied" : "Copy issue report"}</button>
            </div>
            <label className={styles.issueSearch}>
              <span>Volunteer name</span>
              <input onChange={(event) => setIssueQuery(event.target.value)} placeholder="Search volunteer name" type="search" value={issueQuery} />
            </label>
            <div className={styles.filterRow} aria-label="Filter calendar problems">
              {(["all", "unavailable", "temporary"] as AdminIssueFilter[]).map((filter) => (
                <button
                  aria-pressed={issueFilter === filter}
                  className={issueFilter === filter ? styles.filterActive : styles.filterButton}
                  key={filter}
                  onClick={() => setIssueFilter(filter)}
                  type="button"
                >
                  {filter === "all" ? "All issues" : filter === "unavailable" ? "Unavailable" : "Temporary"}
                  <b>{issueCount(activeResults, filter)}</b>
                </button>
              ))}
            </div>
            {issues.length ? (
              <div className={styles.issueList}>
                {issues.map((issue) => <IssueCard key={issue.bookingUrl} issue={issue} />)}
              </div>
            ) : (
              <p className={styles.emptyNotice}>{issueFilter === "all" && !issueQuery.trim() ? "No calendar problems were found in this audit." : "No calendars match this filter."}</p>
            )}
          </section>
        ) : <AuditRequiredNotice onRun={() => void runAudit()} />
      ) : null}

      {view === "volunteers" ? (
        hasAudit ? (
          <VolunteerLookup
            activeResults={activeResults}
            hasAudit={hasAudit}
            lookupQuery={lookupQuery}
            selected={selected}
            setLookupQuery={setLookupQuery}
            setSelectedUrl={setSelectedUrl}
          />
        ) : <AuditRequiredNotice onRun={() => void runAudit()} />
      ) : null}

      <footer className="site-footer" id="about-admin">
        <div className="footer-brand">
          <strong>English Chat Finder</strong>
          <small>Helping administrators understand volunteer calendar health and current availability.</small>
          <span>Designed and built by Papa Kojo Mensah</span>
        </div>
        <nav aria-label="Admin helpful links">
          <a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Official schedule <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
          <a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Prepare for a session <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
          <a href="/">Student finder</a>
        </nav>
        <p className="footer-guidance">Availability comes from Google Calendar. Administrator audits do not change student scan state, and final booking always happens on Google.</p>
      </footer>
    </main>
  );
}
