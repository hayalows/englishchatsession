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
import { earliestAvailableTime } from "@/lib/result-presentation";

import styles from "@/app/admin/admin.module.css";

const ADMIN_AUDIT_STORAGE_KEY = "english-chat-admin-audit:v1";
const OFFICIAL_SCHEDULE = "https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0";
const PREPARE_PAGE = "https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0";

type AuditState = "idle" | "running" | "complete" | "stopped" | "error";
type StoredAudit = { completedAt: string; listedCount: number; results: AdminCalendarResult[] };

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

export function AdminDashboard({ appVersion }: { appVersion: string }) {
  const [auditState, setAuditState] = useState<AuditState>("idle");
  const [audit, setAudit] = useState<AdminAuditReport | null>(null);
  const [progress, setProgress] = useState<AdminAuditProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<AdminIssueFilter>("all");
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
  const issues = useMemo(() => filterAdminIssues(activeResults, issueFilter), [activeResults, issueFilter]);
  const recovered = useMemo(() => activeResults.filter((result) => result.recovered), [activeResults]);
  const available = useMemo(() => activeResults
    .filter((result) => result.status === "available")
    .sort((left, right) => (earliestAvailableTime(right.slotResult) ? 1 : 0) - (earliestAvailableTime(left.slotResult) ? 1 : 0)
      || (earliestAvailableTime(left.slotResult) ?? "").localeCompare(earliestAvailableTime(right.slotResult) ?? "")), [activeResults]);
  const lookupMatches = useMemo(() => findAuditedVolunteers(activeResults, lookupQuery).slice(0, 8), [activeResults, lookupQuery]);
  const selected = selectedUrl ? activeResults.find((result) => result.bookingUrl === selectedUrl) : undefined;
  const progressTotal = progress?.total ?? 0;
  const progressCompleted = progress?.completed ?? 0;
  const progressPercent = progressTotal ? Math.min(100, Math.round((progressCompleted / progressTotal) * 100)) : 0;
  const hasAudit = Boolean(audit || progress);

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
    setReportCopied(false);

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
          <p>Understand volunteer calendar health and take the next useful action.</p>
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
          </div>
          <div className={styles.statusAction}>
            <span>{audit ? `Last audit ${displayDateTime(audit.finishedAt)}` : "No audit run yet"}</span>
            <button className={styles.primaryButton} disabled={auditState === "running"} onClick={() => void runAudit()} type="button">
              {auditState === "running" ? "Audit running…" : "Run health audit"}
            </button>
          </div>
        </div>
        <div className={styles.statGrid}>
          <div><strong>{hasAudit ? summary.listed : "—"}</strong><span>Calendars listed</span></div>
          <div><strong>{hasAudit ? summary.healthy : "—"}</strong><span>Healthy</span></div>
          <div><strong>{hasAudit ? summary.available : "—"}</strong><span>Confirmed available</span></div>
          <div><strong>{hasAudit ? summary.noOpenings : "—"}</strong><span>No openings</span></div>
          <div><strong>{hasAudit ? summary.unavailable : "—"}</strong><span>Unavailable</span></div>
          <div><strong>{hasAudit ? summary.temporary : "—"}</strong><span>Temporary problems</span></div>
        </div>
        {!hasAudit ? <p className={styles.emptyNotice}>Run an audit to check the current volunteer calendars. This dashboard does not treat browser-local student results as live health data.</p> : null}
      </section>

      {auditState === "running" && progress ? (
        <section className={styles.progressPanel} aria-live="polite" aria-labelledby="audit-progress-title">
          <div className={styles.progressHeading}>
            <div><p className={styles.eyebrow}>Live audit</p><h2 id="audit-progress-title">Checking volunteer calendars</h2></div>
            <strong>{progressCompleted} of {progressTotal}</strong>
          </div>
          <progress max={progressTotal || 1} value={progressCompleted}>{progressPercent}%</progress>
          <div className={styles.progressMeta}><span>{progressPercent}% complete</span><span>{summary.available} available · {summary.healthy - summary.available} empty · {summary.unavailable + summary.temporary} require attention</span></div>
          <button className={styles.stopButton} onClick={stopAudit} type="button">Stop audit</button>
        </section>
      ) : null}

      {message ? <p className={styles.alert} role="alert">{message}</p> : null}

      {audit ? (
        <>
          <section className={styles.section} aria-labelledby="issues-title">
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>See problem</p><h2 id="issues-title">Calendars requiring attention</h2><p>These results were not treated as confirmed no availability.</p></div>
              <button className={styles.secondaryButton} onClick={() => void copyIssueReport()} type="button">{reportCopied ? "Issue report copied" : "Copy issue report"}</button>
            </div>
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
                {issues.map((issue) => (
                  <article className={styles.issueCard} key={issue.bookingUrl}>
                    <div className={styles.issueCopy}>
                      <div className={styles.issueTitle}><h3>{issue.tutor ?? "English Chat volunteer"}</h3><span className={`${styles.statusPill} ${resultStatusClass(issue.status)}`}>{ADMIN_STATUS_LABELS[issue.status]}</span></div>
                      <p>{issue.reasonLabel}</p>
                      <small>Last checked {displayDateTime(issue.checkedAt)} · Retry {issue.retryAfter ? displayDateTime(issue.retryAfter) : "on the next explicit audit"}</small>
                    </div>
                    <div className={styles.issueActions}>
                      <a href={issue.bookingUrl} rel="noreferrer" target="_blank">Open Google <span aria-hidden="true">↗</span></a>
                      <CopyIconButton bookingUrl={issue.bookingUrl} calendarName={issue.tutor ?? "English Chat volunteer"} />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyNotice}>{issueFilter === "all" ? "No calendar problems were found in this audit." : "No calendars match this problem filter."}</p>
            )}
          </section>

          {recovered.length ? (
            <section className={styles.recoveredPanel} aria-labelledby="recovered-title">
              <div><p className={styles.eyebrow}>Recovered</p><h2 id="recovered-title">Calendars healthy again</h2><p>{recovered.length} calendar{recovered.length === 1 ? " is" : "s are"} healthy in this audit after a problem in the previous audit.</p></div>
              <ul>{recovered.map((result) => <li key={result.bookingUrl}><strong>{result.tutor ?? "English Chat volunteer"}</strong><span>{ADMIN_STATUS_LABELS[result.status]}</span></li>)}</ul>
            </section>
          ) : null}

          <section className={styles.section} aria-labelledby="availability-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Current availability</p><h2 id="availability-title">Availability snapshot</h2><p>Only confirmed times from this audit appear here.</p></div></div>
            {available.length ? (
              <>
                <div className={styles.availabilitySummary}><strong>{summary.available} volunteer{summary.available === 1 ? "" : "s"} with confirmed openings</strong><span>{summary.thisWeek} this week · {summary.nextWeek} next week · {summary.later} later</span></div>
                <div className={styles.availabilityList}>
                  {available.map((result) => (
                    <article className={styles.availabilityCard} key={result.bookingUrl}>
                      <div><h3>{result.tutor ?? "English Chat volunteer"}</h3><p>{displayOpening(earliestAvailableTime(result.slotResult))}</p><small>Confirmed {displayDateTime(result.checkedAt)}</small></div>
                      <div className={styles.issueActions}><a href={result.bookingUrl} rel="noreferrer" target="_blank">Open Google <span aria-hidden="true">↗</span></a><CopyIconButton bookingUrl={result.bookingUrl} calendarName={result.tutor ?? "English Chat volunteer"} /></div>
                    </article>
                  ))}
                </div>
              </>
            ) : <p className={styles.emptyNotice}>No confirmed openings were returned in this audit window.</p>}
          </section>

          <section className={styles.section} aria-labelledby="lookup-title">
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Understand problem</p><h2 id="lookup-title">Find a volunteer</h2><p>Search the calendars included in this audit. Typing does not make new network requests.</p></div></div>
            <label className={styles.lookupField}><span>Volunteer name</span><input onChange={(event) => setLookupQuery(event.target.value)} placeholder="Start typing a name" type="search" value={lookupQuery} /></label>
            {lookupQuery.trim() && lookupMatches.length ? <div className={styles.lookupMatches}>{lookupMatches.map((result) => <button key={result.bookingUrl} onClick={() => setSelectedUrl(result.bookingUrl)} type="button"><strong>{result.tutor ?? "English Chat volunteer"}</strong><span>{ADMIN_STATUS_LABELS[result.status]}</span></button>)}</div> : null}
            {lookupQuery.trim() && !lookupMatches.length ? <p className={styles.emptyNotice}>No audited volunteer matches that name.</p> : null}
            {selected ? (
              <article className={styles.lookupDetail}>
                <div><h3>{selected.tutor ?? "English Chat volunteer"}</h3><span className={`${styles.statusPill} ${resultStatusClass(selected.status)}`}>{ADMIN_STATUS_LABELS[selected.status]}</span><p>{selected.reasonLabel}</p><small>Last checked {displayDateTime(selected.checkedAt)}</small></div>
                <div className={styles.issueActions}><a href={selected.bookingUrl} rel="noreferrer" target="_blank">Open Google <span aria-hidden="true">↗</span></a><CopyIconButton bookingUrl={selected.bookingUrl} calendarName={selected.tutor ?? "English Chat volunteer"} /></div>
              </article>
            ) : null}
          </section>
        </>
      ) : null}

      <section className={styles.referenceGrid} aria-label="Tools and reference information">
        <section className={styles.referenceCard}>
          <p className={styles.eyebrow}>Website information</p>
          <h2>English Chat Finder</h2>
          <dl><div><dt>Current application version</dt><dd>{appVersion}</dd></div><div><dt>Volunteer calendars listed</dt><dd>{hasAudit ? summary.listed : "Run an audit"}</dd></div><div><dt>Availability source</dt><dd>Google Calendar appointment schedules</dd></div></dl>
          <nav><a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Official volunteer schedule ↗</a><a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Student preparation page ↗</a></nav>
        </section>
        <details className={styles.referenceCard}>
          <summary>How the finder treats calendar results</summary>
          <div className={styles.policyCopy}><p><strong>Confirmed opening:</strong> Google returned one or more appointment times.</p><p><strong>No openings:</strong> Google responded reliably but returned no appointment time in the checked range.</p><p><strong>Calendar unavailable:</strong> the calendar could not provide a usable appointment schedule at the time of checking.</p><p><strong>Temporary problem:</strong> Google or the network did not return enough reliable information. This is not treated as no availability.</p></div>
        </details>
      </section>

      <footer className={styles.adminFooter}><span>One explicit administrator action runs one bounded audit. Audits do not change student scan state.</span><span>Final booking always occurs on Google.</span></footer>
    </main>
  );
}
