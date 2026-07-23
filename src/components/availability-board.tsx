"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getWeekWindow, isDateInWeek } from "@/lib/date-window";
import type { SlotResult, TutorCheckStatus } from "@/lib/monitoring/results";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };
type ResultFilter = "all" | "this_week" | "next_week" | "needs_attention" | TutorCheckStatus;
type ScanReport = { state: "running" | "complete" | "stopped"; completed: number; total: number; urls: string[] };
type StoredResults = { version: 2; savedAt: string; results: Record<string, SlotResult> };

const STORAGE_KEY = "english-chat-booking-results:v2";
const RESULT_MAX_AGE_MS = 30 * 60 * 1000;
const DIRECT_HTTP_SCAN_CONCURRENCY = 10;
const VALID_STATUSES = new Set<TutorCheckStatus>(["available", "none_in_view", "unknown", "failed"]);

function displayTime(value?: string | null) {
  if (!value) return "Not checked yet";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function displayDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function datesInUserTime(result?: SlotResult) {
  if (!result) return [];
  const localDates = result.availableTimes?.map(localDateKey).filter((date): date is string => Boolean(date)) ?? [];
  return localDates.length ? [...new Set(localDates)] : result.availableDates;
}

function hasDateInWeek(result: SlotResult | undefined, weekOffset: number, now: Date) {
  return result?.status === "available" && datesInUserTime(result).some((date) => isDateInWeek(date, weekOffset, now));
}

function displayWeekRange(start?: Date, end?: Date) {
  if (!start || !end) return "";
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
  return start.getMonth() === end.getMonth()
    ? `${day.format(start)}–${dayMonth.format(end)}`
    : `${dayMonth.format(start)}–${dayMonth.format(end)}`;
}

function isRecommendedDay(value: string) {
  const day = new Date(`${value}T12:00:00`).getDay();
  return day === 2 || day === 5;
}

function isFresh(value?: string) {
  return Boolean(value && Date.now() - new Date(value).valueOf() < RESULT_MAX_AGE_MS);
}

function readStoredResults(): Record<string, SlotResult> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as StoredResults | null;
    if (!saved || saved.version !== 2 || !isFresh(saved.savedAt) || typeof saved.results !== "object") return {};
    return Object.fromEntries(Object.entries(saved.results).filter(([, result]) => result && VALID_STATUSES.has(result.status) && isFresh(result.checkedAt)));
  } catch {
    return {};
  }
}

function waitForRetry(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 700);
    signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Stopped", "AbortError")); }, { once: true });
  });
}

async function fetchSlotResult(bookingUrl: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingUrl }), signal });
      const result = (await response.json()) as SlotResult & { message?: string };
      if (response.ok) return result;
      if (attempt === 0 && response.status >= 500) { await waitForRetry(signal); continue; }
      throw new Error(result.message ?? "The booking page could not be checked.");
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      if (attempt === 0) { await waitForRetry(signal); continue; }
      throw error;
    }
  }
  throw new Error("The booking page could not be checked.");
}

const FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" }, { value: "this_week", label: "This week" },
  { value: "next_week", label: "Next week" }, { value: "available", label: "All open dates" },
  { value: "none_in_view", label: "No openings" }, { value: "needs_attention", label: "Needs attention" },
  { value: "not_checked", label: "Not checked" },
];

export function AvailabilityBoard() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotResults, setSlotResults] = useState<Record<string, SlotResult>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [confirmScan, setConfirmScan] = useState(false);
  const [localNow, setLocalNow] = useState<Date | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const refresh = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/availability", { cache: "no-store" });
      const payload = (await response.json()) as Availability & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Unable to read the English Chat scheduling page.");
      setAvailability(payload);
      const validUrls = new Set(payload.bookingPages.map((page) => page.bookingUrl));
      setSlotResults((current) => Object.fromEntries(Object.entries(current).filter(([url, result]) => validUrls.has(url) && (result.status === "checking" || isFresh(result.checkedAt)))));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read the English Chat scheduling page.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let timer: number;
    const updateAtMidnight = () => {
      const now = new Date();
      setLocalNow(now);
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(updateAtMidnight, nextDay.valueOf() - now.valueOf() + 1000);
    };
    updateAtMidnight();
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { setSlotResults(readStoredResults()); void refresh(); }, [refresh]);
  useEffect(() => {
    const persisted = Object.fromEntries(Object.entries(slotResults).filter(([, result]) => VALID_STATUSES.has(result.status) && isFresh(result.checkedAt)));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, savedAt: new Date().toISOString(), results: persisted } satisfies StoredResults)); } catch { /* Storage is optional. */ }
  }, [slotResults]);

  const bookingPages = useMemo(() => availability?.bookingPages ?? [], [availability]);
  const thisWeekWindow = useMemo(() => localNow ? getWeekWindow(0, localNow) : null, [localNow]);
  const nextWeekWindow = useMemo(() => localNow ? getWeekWindow(1, localNow) : null, [localNow]);
  const counts = useMemo(() => {
    const next: Record<ResultFilter, number> = { all: bookingPages.length, this_week: 0, next_week: 0, needs_attention: 0, available: 0, none_in_view: 0, unknown: 0, failed: 0, not_checked: 0, checking: 0 };
    for (const booking of bookingPages) {
      const result = slotResults[booking.bookingUrl];
      next[result?.status ?? "not_checked"] += 1;
      if (result?.status === "unknown" || result?.status === "failed") next.needs_attention += 1;
      if (localNow && hasDateInWeek(result, 0, localNow)) next.this_week += 1;
      if (localNow && hasDateInWeek(result, 1, localNow)) next.next_week += 1;
    }
    return next;
  }, [bookingPages, localNow, slotResults]);
  const visiblePages = useMemo(() => bookingPages
    .filter((booking) => (booking.tutor ?? "English Chat volunteer").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .filter((booking) => {
      const result = slotResults[booking.bookingUrl];
      if (filter === "all") return true;
      if (filter === "this_week") return Boolean(localNow && hasDateInWeek(result, 0, localNow));
      if (filter === "next_week") return Boolean(localNow && hasDateInWeek(result, 1, localNow));
      if (filter === "needs_attention") return result?.status === "unknown" || result?.status === "failed";
      return (result?.status ?? "not_checked") === filter;
    })
    .sort((a, b) => {
      const aResult = slotResults[a.bookingUrl]; const bResult = slotResults[b.bookingUrl];
      if (aResult?.status === "available" && bResult?.status !== "available") return -1;
      if (bResult?.status === "available" && aResult?.status !== "available") return 1;
      if (aResult?.status === "available" && bResult?.status === "available") return (datesInUserTime(aResult)[0] ?? "").localeCompare(datesInUserTime(bResult)[0] ?? "");
      return bookingPages.indexOf(a) - bookingPages.indexOf(b);
    }), [bookingPages, filter, localNow, query, slotResults]);
  const scanCounts = useMemo(() => {
    const values = scan?.urls.map((url) => slotResults[url]?.status ?? "not_checked") ?? [];
    const thisWeek = localNow ? scan?.urls.filter((url) => hasDateInWeek(slotResults[url], 0, localNow)).length ?? 0 : 0;
    const nextWeek = localNow ? scan?.urls.filter((url) => hasDateInWeek(slotResults[url], 1, localNow)).length ?? 0 : 0;
    return { available: values.filter((status) => status === "available").length, thisWeek, nextWeek, none: values.filter((status) => status === "none_in_view").length, attention: values.filter((status) => status === "unknown" || status === "failed").length };
  }, [localNow, scan, slotResults]);
  useEffect(() => {
    if (filter !== "all" && counts[filter] === 0) setFilter("all");
  }, [counts, filter]);
  const hasActiveCheck = counts.checking > 0;
  const thisWeekLabel = displayWeekRange(thisWeekWindow?.start, thisWeekWindow?.end);
  const nextWeekLabel = displayWeekRange(nextWeekWindow?.start, nextWeekWindow?.end);

  async function checkTutor(bookingUrl: string, signal?: AbortSignal, runId?: number) {
    setSlotResults((current) => ({ ...current, [bookingUrl]: { status: "checking", availableDates: [], message: "Checking Google Calendar for open times…" } }));
    try {
      const result = await fetchSlotResult(bookingUrl, signal);
      if (runId === undefined || runId === runIdRef.current) setSlotResults((current) => ({ ...current, [bookingUrl]: result }));
    } catch (error) {
      if ((error as Error).name !== "AbortError" && (runId === undefined || runId === runIdRef.current)) setSlotResults((current) => ({ ...current, [bookingUrl]: { status: "failed", availableDates: [], checkedAt: new Date().toISOString(), message: "The live check failed twice. Open the page directly or retry.", reasonCode: "request_failed" } }));
    }
  }

  async function startScan() {
    const queue = visiblePages.slice();
    if (!queue.length) return;
    setConfirmScan(false);
    const controller = new AbortController(); controllerRef.current = controller;
    const runId = ++runIdRef.current;
    let nextIndex = 0; let completed = 0;
    setScan({ state: "running", completed: 0, total: queue.length, urls: queue.map((page) => page.bookingUrl) });
    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = nextIndex++; if (index >= queue.length) return;
        await checkTutor(queue[index].bookingUrl, controller.signal, runId);
        if (controller.signal.aborted || runId !== runIdRef.current) return;
        completed += 1;
        setScan((current) => current ? { ...current, completed } : current);
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(DIRECT_HTTP_SCAN_CONCURRENCY, queue.length) }, worker)); }
    finally {
      if (runId === runIdRef.current) setScan((current) => current ? { ...current, state: controller.signal.aborted ? "stopped" : "complete", completed } : current);
      controllerRef.current = null;
    }
  }

  function stopScan() {
    controllerRef.current?.abort(); runIdRef.current += 1;
    setSlotResults((current) => Object.fromEntries(Object.entries(current).map(([url, result]) => [url, result.status === "checking" ? { status: "not_checked", availableDates: [], message: "Not checked" } : result])));
    setScan((current) => current ? { ...current, state: "stopped" } : current);
  }

  function requestScan() { if (visiblePages.length > 50) setConfirmScan(true); else void startScan(); }
  function clearResults() { localStorage.removeItem(STORAGE_KEY); setSlotResults({}); setScan(null); setFilter("all"); }

  const recommendedResultFilter: ResultFilter = scanCounts.thisWeek ? "this_week" : scanCounts.nextWeek ? "next_week" : "available";
  const recommendedResultLabel = scanCounts.thisWeek ? "Show this week" : scanCounts.nextWeek ? "Show next week" : "Show open dates";
  const scanGuidance = scanCounts.available === 0
    ? "No confirmed opening was found right now. New times can appear later, so scan again, check the WhatsApp group, or use the official scheduling page."
    : scanCounts.thisWeek >= 2
      ? "You have enough choices to work toward both sessions this week. Open the dates and book the two times that suit you."
      : scanCounts.thisWeek === 1
        ? "One volunteer has an opening this week. Book it if it works, then use next week or scan again later for another session."
        : scanCounts.nextWeek >= 2
          ? "No openings remain this week, but next week has several choices. Book two times that fit your schedule."
          : scanCounts.nextWeek === 1
            ? "No openings remain this week. One volunteer is open next week; book it if it works, then scan again later for another session."
            : "Confirmed openings exist later in the 60-day range. Open all dates to choose one, and scan again later for nearer times.";

  return (
    <>
      <a className="skip-link" href="#session-finder">Skip to availability finder</a>
      <header className="site-header">
        <div className="nav-shell">
          <a className="site-brand" href="#top" aria-label="English Chat Finder home">
            <span className="brand-mark" aria-hidden="true">EC</span>
            <span><strong>English Chat Finder</strong><small>BYU-Pathway student helper</small></span>
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0" rel="noreferrer" target="_blank">Prepare <span aria-hidden="true">↗</span></a>
            <a className="nav-primary" href="#session-finder">Find a time</a>
          </nav>
        </div>
      </header>

      <main className="app-shell" id="top">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">Free English conversation practice</p>
            <h1 id="page-title">Find an English Chat time</h1>
            <p className="lede">Check volunteer calendars, choose a confirmed opening, and book the exact appointment on Google.</p>
            <div className="hero-actions">
              <a className="action-link primary" href="#session-finder">Find an open time</a>
              <a className="action-link secondary" href="#how-it-works">See how it works</a>
            </div>
            <div className="hero-facts" aria-label="English Chat facts"><span>Free</span><span>30 minutes</span><span>One-on-one</span><span>Online</span></div>
          </div>
          <aside className="weekly-goal">
            <p className="eyebrow">Your weekly requirement</p>
            <strong><span>2</span> sessions</strong>
            <p>Scan whenever you need a time. Friday is recommended when planning the following week.</p>
          </aside>
        </section>

        <section className="weekly-route" id="how-it-works" aria-labelledby="weekly-route-title">
          <div className="route-heading"><p className="eyebrow">A simple booking plan</p><h2 id="weekly-route-title">Scan, choose, book</h2></div>
          <ol>
            <li><span>1</span><div><strong>Scan volunteer calendars</strong><p>Use it any day. Friday is a good time to look ahead.</p></div></li>
            <li><span>2</span><div><strong>Choose times that work</strong><p>Aim for two. Tuesday or Friday is ideal, but any available day counts.</p></div></li>
            <li><span>3</span><div><strong>Try again if needed</strong><p>Book a suitable opening now, then rescan later or check the WhatsApp group.</p></div></li>
          </ol>
        </section>

        {message ? <div className="source-error" role="alert"><strong>Couldn’t refresh the volunteer list.</strong><span>{message}</span><button onClick={() => void refresh()} type="button">Try again</button></div> : null}

        <section className="panel sessions-panel" id="session-finder" aria-labelledby="finder-title">
          <div className="panel-heading">
            <div><p className="eyebrow">Live availability</p><h2 id="finder-title">Find an open appointment</h2><p>Scan everyone or search for one volunteer. Confirmed openings appear first.</p></div>
            <button className="text-button" disabled={!Object.keys(slotResults).length} onClick={clearResults} type="button">Clear results</button>
          </div>

          <div className="source-bar" aria-label="Live booking source status">
            <div><span className="live-dot" aria-hidden="true" /><strong>{availability?.bookingPages.length ?? "—"} volunteer calendars ready</strong><span>Updated {displayTime(availability?.checkedAt)}</span></div>
            <div><a href="https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0" rel="noreferrer" target="_blank">Official schedule <span aria-hidden="true">↗</span></a><button disabled={loading} onClick={() => void refresh()} type="button">{loading ? "Refreshing…" : "Refresh list"}</button></div>
          </div>

          <div className="trust-note"><strong>Live Google results</strong><span>Checks open appointment times for the next 60 days. A failed check is never reported as “no openings.”</span></div>

          <div className="finder-controls">
            <label className="search-field"><span>Search by volunteer name</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Type a name…" type="search" value={query} /></label>
            <button disabled={scan?.state === "running" || hasActiveCheck || visiblePages.length === 0} onClick={requestScan} type="button">{query || filter !== "all" ? `Scan ${visiblePages.length} shown` : `Scan all ${visiblePages.length} calendars`}</button>
            {scan?.state === "running" ? <button className="danger-button" onClick={stopScan} type="button">Stop scan</button> : null}
          </div>

          <div className="filter-row" aria-label="Filter volunteer results">
            {FILTERS.map((item) => {
              const range = item.value === "this_week" ? thisWeekLabel : item.value === "next_week" ? nextWeekLabel : "";
              return <button aria-label={`${item.label}${range ? `, ${range}` : ""}: ${counts[item.value]}`} aria-pressed={filter === item.value} className="filter-chip" disabled={item.value !== "all" && counts[item.value] === 0} key={item.value} onClick={() => setFilter(item.value)} type="button"><span className="filter-label"><span>{item.label}</span>{range ? <small>{range}</small> : null}</span><b>{counts[item.value]}</b></button>;
            })}
          </div>

          {confirmScan ? <div className="confirm-card" role="alert"><div><strong>Scan {visiblePages.length} volunteer calendars?</strong><span>This usually takes less than a minute. You can stop without losing completed results.</span></div><div><button onClick={() => void startScan()} type="button">Start scan</button><button className="quiet-button" onClick={() => setConfirmScan(false)} type="button">Cancel</button></div></div> : null}

          {scan ? <section className={`scan-status ${scan.state}`} aria-live="polite">
            <div className="scan-status-heading"><div><strong>{scan.state === "running" ? "Scanning live calendars" : scan.state === "complete" ? (scanCounts.available ? `${scanCounts.available} volunteer${scanCounts.available === 1 ? "" : "s"} with open dates` : "No open dates found") : "Scan stopped"}</strong><span>{scan.completed} of {scan.total} calendars checked · Fast scan</span></div><b>{Math.round((scan.completed / scan.total) * 100)}%</b></div>
            <div className="progress-track"><span style={{ width: `${(scan.completed / scan.total) * 100}%` }} /></div>
            <div className="scan-totals"><span className="positive">{scanCounts.available} open</span><span>{scanCounts.thisWeek} this week</span><span>{scanCounts.nextWeek} next week</span><span>{scanCounts.none} no openings</span><span>{scanCounts.attention} need attention</span></div>
            {scan.state === "complete" ? <div className="scan-next-step"><div><strong>Your next step</strong><p>{scanGuidance}</p></div>{scanCounts.available ? <button className="quiet-button" onClick={() => setFilter(recommendedResultFilter)} type="button">{recommendedResultLabel}</button> : <a className="quiet-link" href="https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0" rel="noreferrer" target="_blank">Open official schedule <span aria-hidden="true">↗</span></a>}</div> : null}
            {scan.state === "stopped" && scan.completed < scan.total ? <button className="quiet-button" onClick={() => { setFilter("not_checked"); setScan(null); }} type="button">Show volunteers not checked</button> : null}
          </section> : null}

          <details className="result-help">
            <summary>Understanding the results</summary>
            <div>
              <p><strong>Open dates:</strong> Google confirmed at least one appointment time.</p>
              <p><strong>No openings:</strong> no times were returned in the 60-day range.</p>
              <p><strong>Needs attention:</strong> retry these checks or open Google directly; they are not counted as “no openings.”</p>
            </div>
          </details>

          <div className="list-heading"><span>{visiblePages.length} volunteer{visiblePages.length === 1 ? "" : "s"} shown</span>{counts.available > 0 ? <strong>{counts.available} with open dates</strong> : <span>Scan to see current openings</span>}</div>
          <div className="session-list">
            {visiblePages.map((booking) => {
              const result = slotResults[booking.bookingUrl] ?? { status: "not_checked", availableDates: [], message: "Not checked yet" } satisfies SlotResult;
              const weekOffset = filter === "this_week" ? 0 : filter === "next_week" ? 1 : null;
              const availableDates = datesInUserTime(result);
              const relevantDates = weekOffset !== null && localNow ? availableDates.filter((date) => isDateInWeek(date, weekOffset, localNow)) : availableDates;
              const relevantTimes = weekOffset !== null && localNow
                ? result.availableTimes?.filter((time) => {
                  const date = localDateKey(time);
                  return Boolean(date && isDateInWeek(date, weekOffset, localNow));
                })
                : result.availableTimes;
              const visibleDates = relevantDates.slice(0, 8);
              return <article className={`session-row ${result.status}`} key={booking.bookingUrl}>
                <div className="tutor-main"><div className="tutor-title"><h3>{booking.tutor ?? "English Chat volunteer"}</h3><span className={`status-badge ${result.status}`}>{result.status === "available" ? "Open dates" : result.status === "none_in_view" ? "No openings in 60 days" : result.status === "unknown" ? "Could not confirm" : result.status === "failed" ? "Link unavailable" : result.status === "checking" ? "Checking…" : "Not checked"}</span></div>
                  <p>{result.status === "available" ? `${availableDates.length} available date${availableDates.length === 1 ? "" : "s"} confirmed from Google Calendar.` : result.message}</p>
                  {visibleDates.length ? <div className="date-list">{visibleDates.map((date) => <span className={isRecommendedDay(date) ? "recommended" : undefined} key={date}>{displayDate(date)}{isRecommendedDay(date) ? <small>Recommended</small> : null}</span>)}{relevantDates.length > visibleDates.length ? <span className="more-dates">+{relevantDates.length - visibleDates.length} more</span> : null}</div> : null}
                  {relevantTimes?.length ? <p className="earliest-time">Earliest opening in your time zone: <strong>{displayTime(relevantTimes[0])}</strong></p> : null}
                  {result.checkedRange ? <small className="range-note">Checked {result.checkedRange.description} · {displayTime(result.checkedAt)}</small> : null}
                </div>
                <div className="slot-actions"><button className={result.status === "available" ? "quiet-check" : undefined} disabled={hasActiveCheck || scan?.state === "running"} onClick={() => void checkTutor(booking.bookingUrl)} type="button">{result.status === "checking" ? "Checking…" : result.status === "available" ? "Refresh dates" : "Check dates"}</button><a className={result.status === "available" ? "booking-link primary" : "booking-link"} href={booking.bookingUrl} rel="noreferrer" target="_blank">{result.status === "available" ? "Book this session" : "Open Google"} <span aria-hidden="true">↗</span></a></div>
              </article>;
            })}
            {!loading && visiblePages.length === 0 ? <div className="empty-state"><strong>No volunteers match this view.</strong><span>Clear the search or choose a different result filter.</span><button className="quiet-button" onClick={() => { setQuery(""); setFilter("all"); }} type="button">Show all volunteers</button></div> : null}
          </div>
        </section>

        <footer className="site-footer" id="about">
          <div className="footer-brand"><strong>English Chat Finder</strong><span>Built by Papa Kojo Mensah</span><small>Independent student-built helper for finding English Chat openings.</small></div>
          <nav aria-label="Footer links"><a href="https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0" rel="noreferrer" target="_blank">Official schedule <span aria-hidden="true">↗</span></a><a href="https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0" rel="noreferrer" target="_blank">Prepare for your session <span aria-hidden="true">↗</span></a></nav>
          <div className="footer-notes"><span>Free for BYU-Pathway students</span><span>No sign-in · No tracking</span><span>Results remain for 30 minutes</span></div>
        </footer>
      </main>
    </>
  );
}
