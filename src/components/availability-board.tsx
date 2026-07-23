"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { dateAtEndOfWindow, isDateWithinDays } from "@/lib/date-window";
import type { SlotResult, TutorCheckStatus } from "@/lib/monitoring/results";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };
type ResultFilter = "all" | "next_7_days" | TutorCheckStatus;
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
  { value: "all", label: "All volunteers" }, { value: "next_7_days", label: "Within 7 days" },
  { value: "available", label: "Open dates" }, { value: "none_in_view", label: "No openings" },
  { value: "unknown", label: "Could not confirm" }, { value: "failed", label: "Link unavailable" },
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

  useEffect(() => { setLocalNow(new Date()); setSlotResults(readStoredResults()); void refresh(); }, [refresh]);
  useEffect(() => {
    const persisted = Object.fromEntries(Object.entries(slotResults).filter(([, result]) => VALID_STATUSES.has(result.status) && isFresh(result.checkedAt)));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, savedAt: new Date().toISOString(), results: persisted } satisfies StoredResults)); } catch { /* Storage is optional. */ }
  }, [slotResults]);

  const bookingPages = useMemo(() => availability?.bookingPages ?? [], [availability]);
  const counts = useMemo(() => {
    const next: Record<ResultFilter, number> = { all: bookingPages.length, next_7_days: 0, available: 0, none_in_view: 0, unknown: 0, failed: 0, not_checked: 0, checking: 0 };
    for (const booking of bookingPages) {
      const result = slotResults[booking.bookingUrl];
      next[result?.status ?? "not_checked"] += 1;
      if (result?.status === "available" && result.availableDates.some((date) => isDateWithinDays(date, 7))) next.next_7_days += 1;
    }
    return next;
  }, [bookingPages, slotResults]);
  const visiblePages = useMemo(() => bookingPages
    .filter((booking) => (booking.tutor ?? "English Chat volunteer").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .filter((booking) => {
      const result = slotResults[booking.bookingUrl];
      if (filter === "all") return true;
      if (filter === "next_7_days") return result?.status === "available" && result.availableDates.some((date) => isDateWithinDays(date, 7));
      return (result?.status ?? "not_checked") === filter;
    })
    .sort((a, b) => {
      const aResult = slotResults[a.bookingUrl]; const bResult = slotResults[b.bookingUrl];
      if (aResult?.status === "available" && bResult?.status !== "available") return -1;
      if (bResult?.status === "available" && aResult?.status !== "available") return 1;
      if (aResult?.status === "available" && bResult?.status === "available") return (aResult.availableDates[0] ?? "").localeCompare(bResult.availableDates[0] ?? "");
      return bookingPages.indexOf(a) - bookingPages.indexOf(b);
    }), [bookingPages, filter, query, slotResults]);
  const scanCounts = useMemo(() => {
    const values = scan?.urls.map((url) => slotResults[url]?.status ?? "not_checked") ?? [];
    const soon = scan?.urls.filter((url) => slotResults[url]?.status === "available" && slotResults[url].availableDates.some((date) => isDateWithinDays(date, 7))).length ?? 0;
    return { available: values.filter((status) => status === "available").length, soon, none: values.filter((status) => status === "none_in_view").length, unknown: values.filter((status) => status === "unknown").length, failed: values.filter((status) => status === "failed").length };
  }, [scan, slotResults]);
  const hasActiveCheck = counts.checking > 0;
  const sevenDayEndLabel = localNow
    ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(dateAtEndOfWindow(7, localNow))
    : "the date exactly seven days from today";

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
  function clearResults() { localStorage.removeItem(STORAGE_KEY); setSlotResults({}); setScan(null); }

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">BYU-Pathway English Chat</p>
          <h1>Book two English Chat sessions this week</h1>
          <p className="lede">Practice one-on-one with a volunteer native English speaker in a friendly, low-stress 30-minute conversation.</p>
          <div className="hero-actions">
            <a className="action-link primary" href="#session-finder">Find an open time</a>
            <a className="action-link secondary" href="https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0" rel="noreferrer" target="_blank">Learn how to prepare <span aria-hidden="true">↗</span></a>
          </div>
          <div className="hero-facts" aria-label="English Chat facts"><span>Free</span><span>30 minutes</span><span>One-on-one</span><span>Online</span></div>
        </div>
        <aside className="weekly-goal">
          <p className="eyebrow">Your weekly requirement</p>
          <strong><span>2</span> sessions</strong>
          <p>Aim for two 30-minute conversations. You can scan any day. Friday is recommended when looking for the following week.</p>
        </aside>
      </header>

      <section className="weekly-route" aria-labelledby="weekly-route-title">
        <div className="route-heading"><p className="eyebrow">A simple booking plan</p><h2 id="weekly-route-title">From scan to conversation</h2></div>
        <ol>
          <li><span>1</span><div><strong>Scan whenever you need a time</strong><p>Friday is a good day to start, but you can scan again on any day.</p></div></li>
          <li><span>2</span><div><strong>Book what works</strong><p>Aim for two sessions. Tuesday or Friday is ideal, but any available day counts.</p></div></li>
          <li><span>3</span><div><strong>If you cannot find two</strong><p>Book a suitable opening now, then scan again later or check the WhatsApp group.</p></div></li>
        </ol>
      </section>

      <aside className="project-credit" aria-label="Project credit">
        <div><span>Student-built helper</span><strong>Built by Papa Kojo Mensah</strong></div>
        <p>An independent project that makes English Chat openings easier to find and understand.</p>
      </aside>

      {message ? <div className="source-error" role="alert"><strong>Couldn’t refresh the volunteer list.</strong><span>{message}</span><button onClick={() => void refresh()} type="button">Try again</button></div> : null}

      <section className="panel sessions-panel" id="session-finder">
        <div className="panel-heading">
          <div><p className="eyebrow">Find an opening</p><h2>Scan volunteer calendars</h2><p>Scan now or whenever you need another session. Confirmed open dates move to the top.</p></div>
          <button className="text-button" disabled={!Object.keys(slotResults).length} onClick={clearResults} type="button">Clear results</button>
        </div>

        <div className="source-bar" aria-label="Live booking source status">
          <div><span className="live-dot" aria-hidden="true" /><strong>{availability?.bookingPages.length ?? "—"} volunteer calendars ready</strong><span>Updated {displayTime(availability?.checkedAt)}</span></div>
          <div><a href="https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0" rel="noreferrer" target="_blank">Official scheduling page <span aria-hidden="true">↗</span></a><button disabled={loading} onClick={() => void refresh()} type="button">{loading ? "Refreshing…" : "Refresh list"}</button></div>
        </div>

        <div className="trust-note"><strong>What the scan checks</strong><span>Google Calendar’s open appointment times for the next 60 days. A failed request is never shown as “no openings.”</span></div>

        <div className="finder-controls">
          <label className="search-field"><span>Search by volunteer name</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Type a name…" type="search" value={query} /></label>
          <button disabled={scan?.state === "running" || hasActiveCheck || visiblePages.length === 0} onClick={requestScan} type="button">{query || filter !== "all" ? `Scan ${visiblePages.length} shown` : `Scan all ${visiblePages.length} calendars`}</button>
          {scan?.state === "running" ? <button className="danger-button" onClick={stopScan} type="button">Stop scan</button> : null}
        </div>

        <div className="filter-row" aria-label="Filter volunteer results">{FILTERS.map((item) => <button aria-pressed={filter === item.value} className="filter-chip" key={item.value} onClick={() => setFilter(item.value)} type="button"><span>{item.label}</span><b>{counts[item.value]}</b></button>)}</div>

        <div className="date-window-guide">
          <strong>An opening exactly 7 days away counts.</strong>
          <span>“Within 7 days” means today through {sevenDayEndLabel}, including that final date. “Open dates” also includes later openings found in the full 60-day scan.</span>
        </div>

        <details className="result-help">
          <summary>What do the result labels mean?</summary>
          <div>
            <p><strong>Open dates:</strong> Google confirmed at least one appointment time.</p>
            <p><strong>No openings:</strong> Google returned no appointment times in the 60-day range checked.</p>
            <p><strong>Could not confirm or link unavailable:</strong> the check did not produce a reliable answer. This does not mean the volunteer has no openings; retry or open Google directly.</p>
          </div>
        </details>

        {confirmScan ? <div className="confirm-card" role="alert"><div><strong>Scan {visiblePages.length} volunteer calendars?</strong><span>This usually takes less than a minute. You can stop without losing completed results.</span></div><div><button onClick={() => void startScan()} type="button">Start scan</button><button className="quiet-button" onClick={() => setConfirmScan(false)} type="button">Cancel</button></div></div> : null}

        {scan ? <section className={`scan-status ${scan.state}`} aria-live="polite">
          <div className="scan-status-heading"><div><strong>{scan.state === "running" ? "Scanning live calendars" : scan.state === "complete" ? (scanCounts.available ? `${scanCounts.available} volunteer${scanCounts.available === 1 ? "" : "s"} with open dates` : "No open dates found") : "Scan stopped"}</strong><span>{scan.completed} of {scan.total} calendars checked · Fast scan</span></div><b>{Math.round((scan.completed / scan.total) * 100)}%</b></div>
          <div className="progress-track"><span style={{ width: `${(scan.completed / scan.total) * 100}%` }} /></div>
          <div className="scan-totals"><span className="positive">{scanCounts.available} with open dates</span><span>{scanCounts.soon} with a date by {sevenDayEndLabel}</span><span>{scanCounts.none} no openings</span><span>{scanCounts.unknown} could not confirm</span><span>{scanCounts.failed} links unavailable</span></div>
          {scan.state === "complete" ? <div className="scan-next-step"><div><strong>What to do next</strong><p>{scanCounts.available >= 2 ? "Start with dates that fit your week, then book two exact times on Google." : scanCounts.available === 1 ? "Book the opening if it works for you. For your second session, scan again later or check the WhatsApp group for newly shared times." : "No confirmed opening was found right now. New times can appear later, so scan again, check the WhatsApp group, or use the official scheduling page."}</p></div>{scanCounts.available ? <button className="quiet-button" onClick={() => setFilter("available")} type="button">Show open dates</button> : <a className="quiet-link" href="https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0" rel="noreferrer" target="_blank">Open official schedule <span aria-hidden="true">↗</span></a>}</div> : null}
          {scan.state === "stopped" && scan.completed < scan.total ? <button className="quiet-button" onClick={() => { setFilter("not_checked"); setScan(null); }} type="button">Show volunteers not checked</button> : null}
        </section> : null}

        <div className="list-heading"><span>{visiblePages.length} volunteer{visiblePages.length === 1 ? "" : "s"} shown</span>{counts.available > 0 ? <strong>{counts.available} with open dates</strong> : <span>Scan to see current openings</span>}</div>
        <div className="session-list">
          {visiblePages.map((booking) => {
            const result = slotResults[booking.bookingUrl] ?? { status: "not_checked", availableDates: [], message: "Not checked yet" } satisfies SlotResult;
            const visibleDates = result.availableDates.slice(0, 8);
            return <article className={`session-row ${result.status}`} key={booking.bookingUrl}>
              <div className="tutor-main"><div className="tutor-title"><h3>{booking.tutor ?? "English Chat volunteer"}</h3><span className={`status-badge ${result.status}`}>{result.status === "available" ? "Open dates" : result.status === "none_in_view" ? "No openings in 60 days" : result.status === "unknown" ? "Could not confirm" : result.status === "failed" ? "Link unavailable" : result.status === "checking" ? "Checking…" : "Not checked"}</span></div>
                <p>{result.message}</p>
                {visibleDates.length ? <div className="date-list">{visibleDates.map((date) => <span className={isRecommendedDay(date) ? "recommended" : undefined} key={date}>{displayDate(date)}{isRecommendedDay(date) ? <small>Recommended</small> : null}</span>)}{result.availableDates.length > visibleDates.length ? <span className="more-dates">+{result.availableDates.length - visibleDates.length} more</span> : null}</div> : null}
                {result.availableTimes?.length ? <p className="earliest-time">Earliest opening in your time zone: <strong>{displayTime(result.availableTimes[0])}</strong></p> : null}
                {result.checkedRange ? <small className="range-note">Checked {result.checkedRange.description} · {displayTime(result.checkedAt)}</small> : null}
              </div>
              <div className="slot-actions"><button className={result.status === "available" ? "quiet-check" : undefined} disabled={hasActiveCheck || scan?.state === "running"} onClick={() => void checkTutor(booking.bookingUrl)} type="button">{result.status === "checking" ? "Checking…" : result.status === "available" ? "Refresh dates" : "Check dates"}</button><a className={result.status === "available" ? "booking-link primary" : "booking-link"} href={booking.bookingUrl} rel="noreferrer" target="_blank">{result.status === "available" ? "Book this session" : "Open Google"} <span aria-hidden="true">↗</span></a></div>
            </article>;
          })}
          {!loading && visiblePages.length === 0 ? <div className="empty-state"><strong>No volunteers match this view.</strong><span>Clear the search or choose a different result filter.</span><button className="quiet-button" onClick={() => { setQuery(""); setFilter("all"); }} type="button">Show all volunteers</button></div> : null}
        </div>
      </section>

      <section className="student-support" aria-label="English Chat guidance">
        <article><p className="eyebrow">Could not find two times?</p><h2>You still have options</h2><ul><li>Book any suitable opening you find now</li><li>Scan again later because volunteers can add new times</li><li>Check the WhatsApp group for daily appointment links</li><li>Choose another day if Tuesday or Friday is full</li></ul></article>
        <article><p className="eyebrow">Before your appointment</p><h2>Know what to expect</h2><p>Review the session structure so you arrive ready to speak and get the most from your 30 minutes.</p><a className="action-link primary" href="https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0" rel="noreferrer" target="_blank">Prepare for your session <span aria-hidden="true">↗</span></a></article>
        <article><p className="eyebrow">No suitable time?</p><h2>Check the WhatsApp group</h2><p>New openings are shared there each day. Your private group link arrives by email and must be approved. Do not share it with anyone else.</p></article>
      </section>

      <footer className="site-footer">
        <span>English Chat sessions are free for BYU-Pathway students.</span>
        <span>No sign-in · No tracking · Results stay in this browser for 30 minutes</span>
      </footer>
    </main>
  );
}
