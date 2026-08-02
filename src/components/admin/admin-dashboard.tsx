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
    <div className={styles.issueActions}>
      <a href={result.bookingUrl} rel="noreferrer" target="_blank">
        Open Google <span aria-hidden="true">↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <CopyIconButton bookingUrl={result.bookingUrl} calendarName={calendarName} />
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
          <span className={styles.statusPill + " " + styles.statusAvailable}>Confirmed availability</span>
        </div>
        <p>{displayOpening(earliestAvailableTime(result.slotResult))}</p>
        <small>Last checked {displayDateTime(result.checkedAt)}</small>
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
          Last checked {displayDateTime(issue.checkedAt)}
          {compact ? "" : " · Retry " + (issue.retryAfter ? displayDateTime(issue.retryAfter) : "on the next explicit audit")}
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
        <p className={styles.eyebrow}>Audit needed</p>
        <h2 id="audit-required-title">Run a health audit to check all current volunteer calendars.</h2>
        <p>The audit checks availability, identifies unavailable calendars, separates temporary failures, and updates this admin overview.</p>
      </div>
      <button className={styles.primaryButton} onClick={onRun} type="button">Run health audit</button>
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
          <p className={styles.eyebrow}>{compact ? "Quick search" : "Audited data"}</p>
          <h2 id={titleId}>{compact ? "Find a volunteer" : "Volunteer lookup"}</h2>
          <p>{compact ? "Search the latest audit without starting another calendar check." : "Search only the volunteers included in the current audit. Typing does not make new network requests."}</p>
        </div>
      </div>
      {!hasAudit ? (
        <p className={styles.emptyNotice}>Run a health audit before searching current volunteer status.</p>
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
                <small>Last checked {displayDateTime(selected.checkedAt)}</small>
              </div>
              <CalendarActions result={selected} />
            </article>
          ) : null}
          {compact ? <button className={styles.textButton} onClick={onOpenFull} type="button">Open full volunteer lookup</button> : null}
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
    ? "Last audit " + displayDateTime(audit.finishedAt)
    : auditState === "running"
      ? "Audit in progress"
      : "No audit run yet";
  const auditActionLabel = auditState === "running" ? "Audit running…" : hasAudit ? "Re-run health audit" : "Run health audit";

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
        setMessage(error instanceof Error ? error.message : "The health audit could not be completed.");
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

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin/login");
  }

  return (
    <main className={styles.adminShell}>
      <header className={styles.adminHeader}>
        <div>
          <a className={styles.brand} href="/">English Chat Finder</a>
          <p className={styles.eyebrow}>Administrator</p>
          <h1>Calendar operations</h1>
          <p>See what is ready, what needs attention, and what to do next.</p>
        </div>
        <div className={styles.headerActions}>
          <a className={styles.studentLink} href="/">← Student finder</a>
          <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
        </div>
      </header>

      <section className={styles.statusPanel} aria-labelledby="system-status-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>System status</p>
            <h2 id="system-status-title">At a glance</h2>
            <p>One bounded audit checks the official volunteer calendars and keeps student scan state separate.</p>
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
            aria-label={"View " + (hasAudit ? summary.available : 0) + " available sessions"}
            className={styles.summaryCard + " " + styles.summaryCardAction + " " + styles.summaryCardAvailable}
            onClick={() => setView("availability")}
            type="button"
          >
            <span className={styles.summaryCardLabel}>Available</span>
            <strong>{hasAudit ? summary.available : "—"}</strong>
            <span>Confirmed openings</span>
            <small>View sessions <span aria-hidden="true">→</span></small>
          </button>
          <button
            aria-label={"Review " + (hasAudit ? attentionCount : 0) + " calendars requiring attention"}
            className={styles.summaryCard + " " + styles.summaryCardAction + " " + styles.summaryCardAttention}
            onClick={() => setView("issues")}
            type="button"
          >
            <span className={styles.summaryCardLabel}>Needs attention</span>
            <strong>{hasAudit ? attentionCount : "—"}</strong>
            <span>{hasAudit ? summary.unavailable + " unavailable · " + summary.temporary + " temporary" : "Unavailable · temporary"}</span>
            <small>Review issues <span aria-hidden="true">→</span></small>
          </button>
          <article className={styles.summaryCard + " " + styles.summaryCardChecked}>
            <span className={styles.summaryCardLabel}>Checked successfully</span>
            <strong>{hasAudit ? summary.healthy : "—"}</strong>
            <span>{hasAudit ? summary.available + " available · " + summary.noOpenings + " no openings" : "Available · no openings"}</span>
          </article>
          <article className={styles.summaryCard + " " + styles.summaryCardTotal}>
            <span className={styles.summaryCardLabel}>Total calendars</span>
            <strong>{hasAudit ? summary.listed : "—"}</strong>
            <span>Official volunteer calendars</span>
          </article>
        </div>
        {!hasAudit ? <p className={styles.emptyNotice}>Run a health audit to check the current volunteer calendars. The first result will update this overview with confirmed openings and issues.</p> : null}
      </section>

      <nav className={styles.taskNav} aria-label="Administrator tasks">
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

      {auditState === "running" && progress ? (
        <section className={styles.progressPanel} aria-live="polite" aria-labelledby="audit-progress-title">
          <div className={styles.progressHeading}>
            <div><p className={styles.eyebrow}>Live audit</p><h2 id="audit-progress-title">Checking volunteer calendars</h2></div>
            <strong>{progressCompleted} of {progressTotal}</strong>
          </div>
          <progress max={progressTotal || 1} value={progressCompleted}>{progressPercent}%</progress>
          <div className={styles.progressMeta}>
            <span>{progressPercent}% complete</span>
            <span>{summary.available} available · {summary.noOpenings} no openings · {attentionCount} require attention</span>
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
                <h2 id="audit-complete-title">The operations picture is up to date.</h2>
                <p>{audit.completedCount} calendars checked · {summary.available} available · {attentionCount} require attention</p>
              </div>
              <div className={styles.completionActions}>
                <button className={styles.primaryButton} onClick={() => setView("availability")} type="button">View availability</button>
                <button className={styles.secondaryButton} onClick={() => setView("issues")} type="button">Review issues</button>
              </div>
            </section>
          ) : null}

          {audit && auditState === "stopped" ? (
            <section className={styles.completionPanel + " " + styles.completionStopped} aria-live="polite" aria-labelledby="audit-stopped-title">
              <div>
                <p className={styles.eyebrow}>Audit stopped</p>
                <h2 id="audit-stopped-title">Partial results remain available.</h2>
                <p>{audit.completedCount} of {audit.listedCount} calendars checked · {summary.available} available · {attentionCount} require attention</p>
              </div>
              <button className={styles.secondaryButton} onClick={() => void runAudit()} type="button">Run another audit</button>
            </section>
          ) : null}

          {!hasAudit ? (
            <section className={styles.auditRequired} aria-labelledby="pre-audit-title">
              <div>
                <p className={styles.eyebrow}>Start here</p>
                <h2 id="pre-audit-title">Run a health audit to check all current volunteer calendars.</h2>
                <p>The audit will check availability, identify unavailable calendars, separate temporary failures, and update the admin overview.</p>
                <ul className={styles.auditSteps}>
                  <li>Check for confirmed openings</li>
                  <li>Separate reliable empty calendars from problems</li>
                  <li>Make the next useful action clear</li>
                </ul>
              </div>
              <button className={styles.primaryButton} onClick={() => void runAudit()} type="button">Run health audit</button>
            </section>
          ) : (
            <>
              <div className={styles.previewGrid}>
                <section className={styles.section} aria-labelledby="availability-preview-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Current availability</p>
                      <h2 id="availability-preview-title">Openings found</h2>
                      <p>{summary.available} volunteer{summary.available === 1 ? "" : "s"} with confirmed openings.</p>
                    </div>
                    <button className={styles.textButton} onClick={() => setView("availability")} type="button">View all {summary.available} available</button>
                  </div>
                  {overviewAvailable.length ? (
                    <div className={styles.availabilityList}>
                      {overviewAvailable.map((result) => <AvailabilityCard key={result.bookingUrl} result={result} />)}
                    </div>
                  ) : (
                    <p className={styles.emptyNotice}>No confirmed openings were returned in this audit window.</p>
                  )}
                </section>

                <section className={styles.section} aria-labelledby="issues-preview-title">
                  <div className={styles.sectionHeading}>
                    <div>
                      <p className={styles.eyebrow}>Needs attention</p>
                      <h2 id="issues-preview-title">{attentionCount} calendar{attentionCount === 1 ? "" : "s"}</h2>
                      <p>{summary.unavailable} unavailable · {summary.temporary} temporary</p>
                    </div>
                    <button className={styles.secondaryButton} disabled={!allIssues.length} onClick={() => setView("issues")} type="button">Review all {attentionCount} issues</button>
                  </div>
                  {overviewIssues.length ? (
                    <div className={styles.issueList}>
                      {overviewIssues.map((issue) => <IssueCard compact key={issue.bookingUrl} issue={issue} />)}
                    </div>
                  ) : (
                    <p className={styles.emptyNotice}>No calendars require attention in this audit.</p>
                  )}
                </section>
              </div>

              {recovered.length ? (
                <section className={styles.recoveredPanel} aria-labelledby="recovered-title">
                  <div>
                    <p className={styles.eyebrow}>Since previous audit</p>
                    <h2 id="recovered-title">{recovered.length} calendar{recovered.length === 1 ? "" : "s"} recovered</h2>
                    <p>These calendars are healthy again. Recovery comparison uses the previous audit stored in this browser.</p>
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

          <section className={styles.referenceGrid} aria-label="Tools and reference information">
            <section className={styles.referenceCard}>
              <p className={styles.eyebrow}>Website information</p>
              <h2>English Chat Finder</h2>
              <dl><div><dt>Current application version</dt><dd>{appVersion}</dd></div><div><dt>Volunteer calendars listed</dt><dd>{hasAudit ? summary.listed : "Run an audit"}</dd></div><div><dt>Availability source</dt><dd>Google Calendar appointment schedules</dd></div></dl>
              <nav><a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Official volunteer schedule ↗<span className="sr-only"> (opens in a new tab)</span></a><a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Student preparation page ↗<span className="sr-only"> (opens in a new tab)</span></a></nav>
            </section>
            <details className={styles.referenceCard}>
              <summary>How the finder treats calendar results</summary>
              <div className={styles.policyCopy}><p><strong>Confirmed opening:</strong> Google returned one or more appointment times.</p><p><strong>No openings:</strong> Google responded reliably but returned no appointment time in the checked range.</p><p><strong>Calendar unavailable:</strong> the calendar could not provide a usable appointment schedule at the time of checking.</p><p><strong>Temporary problem:</strong> Google or the network did not return enough reliable information. This is not treated as no availability.</p></div>
            </details>
          </section>
        </div>
      ) : null}

      {view === "availability" ? (
        hasAudit ? (
          <section className={styles.section} aria-labelledby="availability-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Confirmed openings</p>
                <h2 id="availability-title">Availability</h2>
                <p>Earliest confirmed opening first. Only results from this audit are shown.</p>
              </div>
              <strong className={styles.viewCount}>{summary.available} volunteer{summary.available === 1 ? "" : "s"}</strong>
            </div>
            <div className={styles.availabilitySummary}>
              <strong>{summary.available} volunteer{summary.available === 1 ? "" : "s"} with confirmed openings</strong>
              <span>{summary.thisWeek} this week · {summary.nextWeek} next week · {summary.later} later</span>
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
              <p className={styles.emptyNotice}>No confirmed openings match this time window.</p>
            )}
          </section>
        ) : <AuditRequiredNotice onRun={() => void runAudit()} />
      ) : null}

      {view === "issues" ? (
        hasAudit ? (
          <section className={styles.section} aria-labelledby="issues-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Problem review</p>
                <h2 id="issues-title">Calendars requiring attention</h2>
                <p>{attentionCount} results were not treated as confirmed no availability.</p>
              </div>
              <button className={styles.secondaryButton} disabled={!audit} onClick={() => void copyIssueReport()} type="button">{reportCopied ? "Issue report copied" : "Copy issue report"}</button>
            </div>
            <label className={styles.issueSearch}>
              <span>Filter by volunteer name</span>
              <input onChange={(event) => setIssueQuery(event.target.value)} placeholder="Search issues" type="search" value={issueQuery} />
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
              <p className={styles.emptyNotice}>{issueFilter === "all" && !issueQuery.trim() ? "No calendar problems were found in this audit." : "No calendars match this problem filter."}</p>
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

      <footer className={styles.adminFooter}><span>One explicit administrator action runs one bounded audit. Audits do not change student scan state.</span><span>Final booking always occurs on Google.</span></footer>
    </main>
  );
}
