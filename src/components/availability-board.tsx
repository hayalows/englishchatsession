"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SlotResult, TutorCheckStatus } from "@/lib/monitoring/results";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };
type ResultFilter = "all" | TutorCheckStatus;
type ScanReport = { state: "running" | "complete" | "stopped"; completed: number; total: number; urls: string[] };
type StoredResults = { version: 2; savedAt: string; results: Record<string, SlotResult> };

const STORAGE_KEY = "english-chat-booking-results:v2";
const RESULT_MAX_AGE_MS = 30 * 60 * 1000;
const BROWSER_SCAN_CONCURRENCY = 3;
const VALID_STATUSES = new Set<TutorCheckStatus>(["available", "none_in_view", "unknown", "failed"]);

function displayTime(value?: string | null) {
  if (!value) return "Not checked yet";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function displayDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
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
  { value: "all", label: "All" }, { value: "available", label: "Available" },
  { value: "none_in_view", label: "No dates" }, { value: "unknown", label: "Needs confirmation" },
  { value: "failed", label: "Check failed" }, { value: "not_checked", label: "Not checked" },
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

  useEffect(() => { setSlotResults(readStoredResults()); void refresh(); }, [refresh]);
  useEffect(() => {
    const persisted = Object.fromEntries(Object.entries(slotResults).filter(([, result]) => VALID_STATUSES.has(result.status) && isFresh(result.checkedAt)));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, savedAt: new Date().toISOString(), results: persisted } satisfies StoredResults)); } catch { /* Storage is optional. */ }
  }, [slotResults]);

  const bookingPages = useMemo(() => availability?.bookingPages ?? [], [availability]);
  const counts = useMemo(() => {
    const next: Record<ResultFilter, number> = { all: bookingPages.length, available: 0, none_in_view: 0, unknown: 0, failed: 0, not_checked: 0, checking: 0 };
    for (const booking of bookingPages) next[slotResults[booking.bookingUrl]?.status ?? "not_checked"] += 1;
    return next;
  }, [bookingPages, slotResults]);
  const visiblePages = useMemo(() => bookingPages
    .filter((booking) => (booking.tutor ?? "English Chat tutor").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .filter((booking) => filter === "all" || (slotResults[booking.bookingUrl]?.status ?? "not_checked") === filter)
    .sort((a, b) => {
      const aResult = slotResults[a.bookingUrl]; const bResult = slotResults[b.bookingUrl];
      if (aResult?.status === "available" && bResult?.status !== "available") return -1;
      if (bResult?.status === "available" && aResult?.status !== "available") return 1;
      if (aResult?.status === "available" && bResult?.status === "available") return (aResult.availableDates[0] ?? "").localeCompare(bResult.availableDates[0] ?? "");
      return bookingPages.indexOf(a) - bookingPages.indexOf(b);
    }), [bookingPages, filter, query, slotResults]);
  const scanCounts = useMemo(() => {
    const values = scan?.urls.map((url) => slotResults[url]?.status ?? "not_checked") ?? [];
    return { available: values.filter((status) => status === "available").length, none: values.filter((status) => status === "none_in_view").length, unknown: values.filter((status) => status === "unknown").length, failed: values.filter((status) => status === "failed").length };
  }, [scan, slotResults]);
  const hasActiveCheck = counts.checking > 0;

  async function checkTutor(bookingUrl: string, signal?: AbortSignal, runId?: number) {
    setSlotResults((current) => ({ ...current, [bookingUrl]: { status: "checking", availableDates: [], message: "Checking Google Calendar now…" } }));
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
    try { await Promise.all(Array.from({ length: Math.min(BROWSER_SCAN_CONCURRENCY, queue.length) }, worker)); }
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
      <header className="topbar"><div><p className="eyebrow">BYU-Pathway English Chat</p><h1>Find your next conversation</h1><p className="lede">Check tutors’ live Google Calendar pages, compare confirmed dates, then book directly.</p></div><div className="privacy-note"><strong>No sign-in. No tracking.</strong><span>Checks stay in this browser for 30 minutes.</span></div></header>

      <section className="signal-panel" aria-label="Live booking source status">
        <div className="source-stat"><p className="eyebrow">Live tutor directory</p><div><strong>{availability?.bookingPages.length ?? "—"}</strong><span>booking pages found</span></div></div>
        <div className="signal-detail"><span>Directory refreshed</span><strong>{displayTime(availability?.checkedAt)}</strong><small>Availability is checked only when you choose a tutor or start a scan.</small></div>
        <button className="secondary-on-dark" disabled={loading} onClick={() => void refresh()} type="button">{loading ? "Refreshing…" : "Refresh tutor list"}</button>
      </section>
      {message ? <div className="source-error" role="alert"><strong>Couldn’t refresh the tutor list.</strong><span>{message}</span><button onClick={() => void refresh()} type="button">Try again</button></div> : null}

      <section className="how-it-works" aria-label="How availability checks work"><strong>What “available” means</strong><p>We read the dates Google Calendar displays and, when offered, follow <em>Jump to the next bookable date</em>. We report the exact range checked and never turn an unreadable page into “no dates.”</p></section>

      <section className="panel sessions-panel">
        <div className="panel-heading"><div><p className="eyebrow">Live availability finder</p><h2>Choose a tutor</h2></div><button className="text-button" disabled={!Object.keys(slotResults).length} onClick={clearResults} type="button">Clear results</button></div>
        <div className="finder-controls">
          <label className="search-field"><span>Search tutors</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a tutor’s name…" type="search" value={query} /></label>
          <button disabled={scan?.state === "running" || hasActiveCheck || visiblePages.length === 0} onClick={requestScan} type="button">Check {query || filter !== "all" ? `${visiblePages.length} shown` : `all ${visiblePages.length}`} tutors</button>
          {scan?.state === "running" ? <button className="danger-button" onClick={stopScan} type="button">Stop scan</button> : null}
        </div>

        <div className="filter-row" aria-label="Filter tutor results">{FILTERS.map((item) => <button aria-pressed={filter === item.value} className="filter-chip" key={item.value} onClick={() => setFilter(item.value)} type="button"><span>{item.label}</span><b>{counts[item.value]}</b></button>)}</div>

        {confirmScan ? <div className="confirm-card" role="alert"><div><strong>Check {visiblePages.length} tutors?</strong><span>A full directory scan can take 25–45 minutes. Three pages run at a time to keep the service stable, and you can stop without losing completed results.</span></div><div><button onClick={() => void startScan()} type="button">Start scan</button><button className="quiet-button" onClick={() => setConfirmScan(false)} type="button">Cancel</button></div></div> : null}

        {scan ? <section className={`scan-status ${scan.state}`} aria-live="polite">
          <div className="scan-status-heading"><div><strong>{scan.state === "running" ? "Checking live calendars" : scan.state === "complete" ? "Scan complete" : "Scan stopped"}</strong><span>{scan.completed} of {scan.total} tutors checked · Fast scan enabled</span></div><b>{Math.round((scan.completed / scan.total) * 100)}%</b></div>
          <div className="progress-track"><span style={{ width: `${(scan.completed / scan.total) * 100}%` }} /></div>
          <div className="scan-totals"><span className="positive">{scanCounts.available} available</span><span>{scanCounts.none} no dates in range</span><span>{scanCounts.unknown} need confirmation</span><span>{scanCounts.failed} failed</span></div>
          {scan.state === "complete" ? <p>{scanCounts.available ? "Confirmed dates are listed first. Open Book to choose an exact time." : "No dates were confirmed in the ranges checked. Review “Needs confirmation” or open any page directly."}</p> : null}
          {scan.state === "stopped" && scan.completed < scan.total ? <button className="quiet-button" onClick={() => { setFilter("not_checked"); setScan(null); }} type="button">Show tutors not checked</button> : null}
        </section> : null}

        <div className="list-heading"><span>{visiblePages.length} tutor{visiblePages.length === 1 ? "" : "s"} shown</span>{counts.available > 0 ? <strong>{counts.available} with confirmed dates</strong> : null}</div>
        <div className="session-list">
          {visiblePages.map((booking) => {
            const result = slotResults[booking.bookingUrl] ?? { status: "not_checked", availableDates: [], message: "Not checked yet" } satisfies SlotResult;
            return <article className={`session-row ${result.status}`} key={booking.bookingUrl}>
              <div className="tutor-main"><div className="tutor-title"><h3>{booking.tutor ?? "English Chat tutor"}</h3><span className={`status-badge ${result.status}`}>{result.status === "available" ? "Available" : result.status === "none_in_view" ? "No dates in range" : result.status === "unknown" ? "Needs confirmation" : result.status === "failed" ? "Check failed" : result.status === "checking" ? "Checking…" : "Not checked"}</span></div>
                <p>{result.message}</p>
                {result.availableDates.length ? <div className="date-list">{result.availableDates.map((date) => <span key={date}>{displayDate(date)}</span>)}</div> : null}
                {result.checkedRange ? <small>Range checked: {result.checkedRange.description} · {displayTime(result.checkedAt)}</small> : null}
              </div>
              <div className="slot-actions"><button disabled={hasActiveCheck || scan?.state === "running"} onClick={() => void checkTutor(booking.bookingUrl)} type="button">{result.status === "checking" ? "Checking…" : "Check live"}</button><a href={booking.bookingUrl} rel="noreferrer" target="_blank">Book on Google <span aria-hidden="true">↗</span></a></div>
            </article>;
          })}
          {!loading && visiblePages.length === 0 ? <div className="empty-state"><strong>No tutors match this view.</strong><span>Clear the search or choose a different result filter.</span><button className="quiet-button" onClick={() => { setQuery(""); setFilter("all"); }} type="button">Show all tutors</button></div> : null}
        </div>
      </section>
    </main>
  );
}
