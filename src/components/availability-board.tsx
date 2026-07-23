"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getWeekWindow } from "@/lib/date-window";
import type { SlotResult, TutorCheckStatus } from "@/lib/monitoring/results";
import {
  chooseRecommendedView,
  countAvailableTimes,
  datesInUserTime,
  earliestAvailableTime,
  hasDateInWeek,
  openingGroup,
  type OpeningGroup,
} from "@/lib/result-presentation";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };
type ResultFilter = "best" | "this_week" | "next_week" | "later" | "needs_attention" | "none_in_view" | "not_checked";
type ResultSection = OpeningGroup | "needs_attention" | "none_in_view" | "not_checked";
type ScanReport = {
  state: "running" | "complete" | "stopped";
  completed: number;
  completedUrls: string[];
  total: number;
  urls: string[];
  startedAt: string;
  finishedAt?: string;
  scope: string;
};
type StoredResults = { version: 2; savedAt: string; results: Record<string, SlotResult> };

const STORAGE_KEY = "english-chat-booking-results:v2";
const RESULT_MAX_AGE_MS = 30 * 60 * 1000;
const DIRECT_HTTP_SCAN_CONCURRENCY = 10;
const VALID_STATUSES = new Set<TutorCheckStatus>(["available", "none_in_view", "unknown", "failed"]);
const OFFICIAL_SCHEDULE = "https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0";
const PREPARE_PAGE = "https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0";

const FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "best", label: "Best openings" },
  { value: "this_week", label: "This week" },
  { value: "next_week", label: "Next week" },
  { value: "later", label: "Later" },
  { value: "needs_attention", label: "Needs attention" },
];

const SECTION_LABELS: Record<ResultSection, string> = {
  this_week: "Open this week",
  next_week: "Open next week",
  later: "Open later",
  needs_attention: "Needs another look",
  none_in_view: "No openings returned",
  not_checked: "Ready to check",
};

function displayTime(value?: string | null) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not checked yet";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function displayClock(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function displayDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function displayOpening(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
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

function readStoredResults() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as StoredResults | null;
    if (!saved || saved.version !== 2 || typeof saved.results !== "object") return { results: {}, expired: false };
    if (!isFresh(saved.savedAt)) return { results: {}, expired: Object.keys(saved.results).length > 0 };
    const results = Object.fromEntries(
      Object.entries(saved.results).filter(([, result]) => result && VALID_STATUSES.has(result.status) && isFresh(result.checkedAt)),
    );
    return { results, expired: Object.keys(saved.results).length > Object.keys(results).length };
  } catch {
    return { results: {}, expired: false };
  }
}

function waitForRetry(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, 700);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    }, { once: true });
  });
}

async function fetchSlotResult(bookingUrl: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingUrl }),
        signal,
      });
      const result = (await response.json()) as SlotResult & { message?: string };
      if (response.ok) return result;
      if (attempt === 0 && response.status >= 500) {
        await waitForRetry(signal);
        continue;
      }
      throw new Error(result.message ?? "The booking page could not be checked.");
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      if (attempt === 0) {
        await waitForRetry(signal);
        continue;
      }
      throw error;
    }
  }
  throw new Error("The booking page could not be checked.");
}

function resultSection(result: SlotResult | undefined, now: Date): ResultSection {
  const opening = openingGroup(result, now);
  if (opening) return opening;
  if (result?.status === "unknown" || result?.status === "failed") return "needs_attention";
  if (result?.status === "none_in_view") return "none_in_view";
  return "not_checked";
}

export function AvailabilityBoard() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotResults, setSlotResults] = useState<Record<string, SlotResult>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("best");
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [confirmScan, setConfirmScan] = useState(false);
  const [resultsExpired, setResultsExpired] = useState(false);
  const [localNow, setLocalNow] = useState<Date | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const autoSelectedRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/availability", { cache: "no-store" });
      const payload = (await response.json()) as Availability & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Unable to read the English Chat scheduling page.");
      setAvailability(payload);
      const validUrls = new Set(payload.bookingPages.map((page) => page.bookingUrl));
      setSlotResults((current) => Object.fromEntries(
        Object.entries(current).filter(([url, result]) => validUrls.has(url) && (result.status === "checking" || isFresh(result.checkedAt))),
      ));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read the English Chat scheduling page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let midnightTimer: number;
    const updateAtMidnight = () => {
      const now = new Date();
      setLocalNow(now);
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = window.setTimeout(updateAtMidnight, nextDay.valueOf() - now.valueOf() + 1000);
    };
    updateAtMidnight();
    return () => window.clearTimeout(midnightTimer);
  }, []);

  useEffect(() => {
    const stored = readStoredResults();
    setSlotResults(stored.results);
    setResultsExpired(stored.expired);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlotResults((current) => {
        const entries = Object.entries(current);
        const fresh = entries.filter(([, result]) => result.status === "checking" || !VALID_STATUSES.has(result.status) || isFresh(result.checkedAt));
        if (fresh.length === entries.length) return current;
        setResultsExpired(true);
        return Object.fromEntries(fresh);
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const persisted = Object.fromEntries(
      Object.entries(slotResults).filter(([, result]) => VALID_STATUSES.has(result.status) && isFresh(result.checkedAt)),
    );
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        savedAt: new Date().toISOString(),
        results: persisted,
      } satisfies StoredResults));
    } catch {
      // Browser storage is optional.
    }
  }, [slotResults]);

  const bookingPages = useMemo(() => availability?.bookingPages ?? [], [availability]);
  const searchedPages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return bookingPages.filter((booking) => (booking.tutor ?? "English Chat volunteer").toLocaleLowerCase().includes(normalizedQuery));
  }, [bookingPages, query]);
  const thisWeekWindow = useMemo(() => localNow ? getWeekWindow(0, localNow) : null, [localNow]);
  const nextWeekWindow = useMemo(() => localNow ? getWeekWindow(1, localNow) : null, [localNow]);

  const counts = useMemo(() => {
    const next = {
      available: 0,
      this_week: 0,
      next_week: 0,
      later: 0,
      none_in_view: 0,
      needs_attention: 0,
      not_checked: 0,
      checking: 0,
    };
    if (!localNow) return next;
    for (const booking of searchedPages) {
      const result = slotResults[booking.bookingUrl];
      if (result?.status === "available") {
        next.available += 1;
        next[openingGroup(result, localNow) ?? "later"] += 1;
      } else if (result?.status === "none_in_view") {
        next.none_in_view += 1;
      } else if (result?.status === "unknown" || result?.status === "failed") {
        next.needs_attention += 1;
      } else if (result?.status === "checking") {
        next.checking += 1;
      } else {
        next.not_checked += 1;
      }
    }
    return next;
  }, [localNow, searchedPages, slotResults]);

  const visiblePages = useMemo(() => {
    if (!localNow) return [];
    return searchedPages
      .filter((booking) => {
        const result = slotResults[booking.bookingUrl];
        const section = resultSection(result, localNow);
        if (filter === "best") {
          if (counts.available > 0) return result?.status === "available";
          if (scan?.state === "complete") return counts.needs_attention > 0 && section === "needs_attention";
          return section !== "none_in_view";
        }
        return section === filter;
      })
      .sort((a, b) => {
        const rank: Record<ResultSection, number> = {
          this_week: 0,
          next_week: 1,
          later: 2,
          needs_attention: 3,
          not_checked: 4,
          none_in_view: 5,
        };
        const aResult = slotResults[a.bookingUrl];
        const bResult = slotResults[b.bookingUrl];
        const sectionDifference = rank[resultSection(aResult, localNow)] - rank[resultSection(bResult, localNow)];
        if (sectionDifference) return sectionDifference;
        const aTime = earliestAvailableTime(aResult);
        const bTime = earliestAvailableTime(bResult);
        if (aTime && bTime) return new Date(aTime).valueOf() - new Date(bTime).valueOf();
        return (a.tutor ?? "").localeCompare(b.tutor ?? "");
      });
  }, [counts.available, counts.needs_attention, filter, localNow, scan?.state, searchedPages, slotResults]);

  const sections = useMemo(() => {
    if (!localNow) return [] as { key: ResultSection; pages: BookingPage[] }[];
    const grouped = new Map<ResultSection, BookingPage[]>();
    for (const page of visiblePages) {
      const key = resultSection(slotResults[page.bookingUrl], localNow);
      grouped.set(key, [...(grouped.get(key) ?? []), page]);
    }
    const order: ResultSection[] = ["this_week", "next_week", "later", "needs_attention", "not_checked", "none_in_view"];
    return order.flatMap((key) => grouped.has(key) ? [{ key, pages: grouped.get(key)! }] : []);
  }, [localNow, slotResults, visiblePages]);

  const scanCounts = useMemo(() => {
    const completedUrls = scan?.completedUrls ?? [];
    const values = completedUrls.map((url) => slotResults[url]?.status ?? "not_checked");
    const thisWeek = localNow ? completedUrls.filter((url) => hasDateInWeek(slotResults[url], 0, localNow)).length : 0;
    const nextWeek = localNow ? completedUrls.filter((url) => hasDateInWeek(slotResults[url], 1, localNow)).length : 0;
    return {
      available: values.filter((status) => status === "available").length,
      thisWeek,
      nextWeek,
      later: localNow
        ? completedUrls.filter((url) => openingGroup(slotResults[url], localNow) === "later").length
        : 0,
      none: values.filter((status) => status === "none_in_view").length,
      attention: values.filter((status) => status === "unknown" || status === "failed").length,
    };
  }, [localNow, scan, slotResults]);

  const scanRange = useMemo(() => (scan?.completedUrls ?? [])
    .map((url) => slotResults[url]?.checkedRange?.description)
    .find(Boolean), [scan, slotResults]);

  useEffect(() => {
    if (!scan || scan.state !== "complete" || autoSelectedRef.current === scan.startedAt) return;
    const nextFilter: ResultFilter = chooseRecommendedView(scanCounts);
    setFilter(nextFilter);
    autoSelectedRef.current = scan.startedAt;
  }, [scan, scanCounts]);

  const hasActiveCheck = counts.checking > 0;
  const thisWeekLabel = displayWeekRange(thisWeekWindow?.start, thisWeekWindow?.end);
  const nextWeekLabel = displayWeekRange(nextWeekWindow?.start, nextWeekWindow?.end);
  const filterCount = (value: ResultFilter) => value === "best" ? counts.available : counts[value];

  async function checkTutor(bookingUrl: string, signal?: AbortSignal, runId?: number) {
    setResultsExpired(false);
    setSlotResults((current) => ({
      ...current,
      [bookingUrl]: { status: "checking", availableDates: [], message: "Checking Google Calendar for open times…" },
    }));
    try {
      const result = await fetchSlotResult(bookingUrl, signal);
      if (runId === undefined || runId === runIdRef.current) {
        setSlotResults((current) => ({ ...current, [bookingUrl]: result }));
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError" && (runId === undefined || runId === runIdRef.current)) {
        setSlotResults((current) => ({
          ...current,
          [bookingUrl]: {
            status: "failed",
            availableDates: [],
            checkedAt: new Date().toISOString(),
            message: "The live check failed twice. Open the page directly or try again.",
            reasonCode: "request_failed",
          },
        }));
      }
    }
  }

  async function startScan(pages = searchedPages) {
    const queue = pages.slice();
    if (!queue.length) return;
    setConfirmScan(false);
    setResultsExpired(false);
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    let nextIndex = 0;
    let completed = 0;
    const startedAt = new Date().toISOString();
    const scope = query.trim()
      ? `${queue.length} volunteer${queue.length === 1 ? "" : "s"} matching “${query.trim()}”`
      : queue.length === bookingPages.length
        ? `all ${queue.length} volunteer calendars`
        : `${queue.length} selected volunteer calendars`;
    setScan({
      state: "running",
      completed: 0,
      completedUrls: [],
      total: queue.length,
      urls: queue.map((page) => page.bookingUrl),
      startedAt,
      scope,
    });

    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = nextIndex++;
        if (index >= queue.length) return;
        await checkTutor(queue[index].bookingUrl, controller.signal, runId);
        if (controller.signal.aborted || runId !== runIdRef.current) return;
        completed += 1;
        setScan((current) => current ? {
          ...current,
          completed,
          completedUrls: [...current.completedUrls, queue[index].bookingUrl],
        } : current);
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(DIRECT_HTTP_SCAN_CONCURRENCY, queue.length) }, worker));
    } finally {
      if (runId === runIdRef.current) {
        setScan((current) => current ? {
          ...current,
          state: controller.signal.aborted ? "stopped" : "complete",
          completed,
          finishedAt: new Date().toISOString(),
        } : current);
      }
      controllerRef.current = null;
    }
  }

  function stopScan() {
    controllerRef.current?.abort();
    runIdRef.current += 1;
    setSlotResults((current) => Object.fromEntries(
      Object.entries(current).map(([url, result]) => [
        url,
        result.status === "checking" ? { status: "not_checked", availableDates: [], message: "Not checked" } : result,
      ]),
    ));
    setScan((current) => current ? { ...current, state: "stopped", finishedAt: new Date().toISOString() } : current);
  }

  function scanRemaining() {
    if (!scan) return;
    const completedUrls = new Set(scan.completedUrls ?? []);
    const remainingUrls = new Set(scan.urls.filter((url) => !completedUrls.has(url)));
    const remainingPages = bookingPages.filter((page) => remainingUrls.has(page.bookingUrl));
    void startScan(remainingPages);
  }

  function requestScan() {
    if (searchedPages.length > 50) setConfirmScan(true);
    else void startScan();
  }

  function clearResults() {
    localStorage.removeItem(STORAGE_KEY);
    setSlotResults({});
    setScan(null);
    setFilter("best");
    setResultsExpired(false);
  }

  const recommendedResultFilter: ResultFilter = scanCounts.thisWeek
    ? "this_week"
    : scanCounts.nextWeek
      ? "next_week"
      : "later";
  const recommendedResultLabel = scanCounts.thisWeek
    ? "See this week"
    : scanCounts.nextWeek
      ? "See next week"
      : "See later openings";
  const scanGuidance = scanCounts.available === 0
    ? scanCounts.attention
      ? `${scanCounts.attention} check${scanCounts.attention === 1 ? " needs" : "s need"} another try. These are not counted as “no openings.”`
      : "No confirmed opening was returned right now. Times can be added or taken at any moment, so try again later and check the official schedule."
    : scanCounts.thisWeek >= 2
      ? "You have at least two choices this week. Open Google to choose the exact times that work for you."
      : scanCounts.thisWeek === 1
        ? "There is one choice this week. Choose it if it works, then look at next week or scan again later."
        : scanCounts.nextWeek >= 2
          ? "The strongest choices are next week. Open Google and choose two times that fit your schedule."
          : scanCounts.nextWeek === 1
            ? "There is one choice next week. Choose it if it works, then scan again later for a second session."
            : "Openings were found later in the scan range. Choose one now or scan again later for a nearer time.";

  function renderCard(booking: BookingPage) {
    const result = slotResults[booking.bookingUrl] ?? {
      status: "not_checked",
      availableDates: [],
      message: "Not checked yet",
    } satisfies SlotResult;
    const availableDates = datesInUserTime(result);
    const earliest = earliestAvailableTime(result);
    const timeCount = countAvailableTimes(result);
    const statusLabel = result.status === "available"
      ? "Open"
      : result.status === "none_in_view"
        ? "No openings"
        : result.status === "unknown"
          ? "Could not confirm"
          : result.status === "failed"
            ? "Check failed"
            : result.status === "checking"
              ? "Checking…"
              : "Not checked";
    const resultMessage = result.status === "available"
      ? `${timeCount} open time${timeCount === 1 ? "" : "s"} across ${availableDates.length} date${availableDates.length === 1 ? "" : "s"}`
      : result.status === "none_in_view"
        ? `Google returned no open times${result.checkedRange?.description ? ` for ${result.checkedRange.description}` : " in the checked range"}.`
        : result.message;

    return (
      <article className={`result-card ${result.status}`} key={booking.bookingUrl}>
        <div className="result-copy">
          <div className="result-title">
            <h4>{booking.tutor ?? "English Chat volunteer"}</h4>
            <span className={`status-pill ${result.status}`}>{statusLabel}</span>
          </div>
          {earliest ? <p className="opening-time">{displayOpening(earliest)}</p> : null}
          <p className="result-message">{resultMessage}</p>
          {result.status === "available" && availableDates.length > 1 ? (
            <div className="date-list" aria-label={`Open dates for ${booking.tutor ?? "this volunteer"}`}>
              {availableDates.slice(0, 4).map((date) => (
                <span className={isRecommendedDay(date) ? "recommended" : undefined} key={date}>
                  {displayDate(date)}
                  {isRecommendedDay(date) ? <small>Tue/Fri</small> : null}
                </span>
              ))}
              {availableDates.length > 4 ? <span className="more-dates">+{availableDates.length - 4} more</span> : null}
            </div>
          ) : null}
          {result.checkedAt ? (
            <small className="result-meta">
              {result.status === "available" ? "Confirmed by Google" : "Checked with Google"}
              <span aria-hidden="true">·</span>
              {displayClock(result.checkedAt)}
            </small>
          ) : null}
        </div>
        <div className="result-actions">
          <button
            className="secondary-button"
            disabled={hasActiveCheck || scan?.state === "running"}
            onClick={() => void checkTutor(booking.bookingUrl)}
            type="button"
          >
            {result.status === "checking" ? "Checking…" : result.status === "not_checked" ? "Check this calendar" : "Refresh"}
          </button>
          <a
            className={result.status === "available" ? "booking-link primary" : "booking-link"}
            href={booking.bookingUrl}
            rel="noreferrer"
            target="_blank"
          >
            {result.status === "available" ? "Choose a time on Google" : "Open Google"}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </article>
    );
  }

  return (
    <>
      <a className="skip-link" href="#session-finder">Skip to appointment finder</a>
      <header className="site-header">
        <div className="nav-shell">
          <a className="site-brand" href="#top" aria-label="English Chat Finder home">
            <span className="brand-mark" aria-hidden="true">EC</span>
            <span>
              <strong>English Chat Finder</strong>
              <small>Student-built booking helper</small>
            </span>
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Prepare <span aria-hidden="true">↗</span></a>
            <a className="nav-primary" href="#session-finder">Find a time</a>
          </nav>
        </div>
      </header>

      <main className="app-shell" id="top">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">BYU-Pathway English Chat</p>
            <h1 id="page-title">Find an open conversation.</h1>
            <p className="lede">See which volunteer calendars have appointment times, then choose and confirm your session directly on Google.</p>
            <div className="hero-actions">
              <a className="action-link primary" href="#session-finder">Find an open time <span aria-hidden="true">↓</span></a>
              <a className="action-link secondary" href="#how-it-works">How it works</a>
            </div>
            <div className="hero-facts" aria-label="English Chat facts">
              <span>Free</span><span>30 minutes</span><span>One-to-one</span><span>Online</span>
            </div>
          </div>
          <aside className="weekly-goal" aria-label="Weekly English Chat goal">
            <p className="eyebrow">Your weekly goal</p>
            <p className="goal-number"><span>2</span> sessions</p>
            <p>Look any day you need a time. Friday is a helpful day to plan for the week ahead.</p>
            <a href="#session-finder">Start with the live calendars <span aria-hidden="true">→</span></a>
          </aside>
        </section>

        <section className="weekly-route" id="how-it-works" aria-labelledby="weekly-route-title">
          <div className="route-heading">
            <p className="eyebrow">Three simple steps</p>
            <h2 id="weekly-route-title">From scan to session</h2>
          </div>
          <ol>
            <li><span>01</span><div><strong>Scan</strong><p>Check all volunteers, or search for one name.</p></div></li>
            <li><span>02</span><div><strong>Choose</strong><p>Start with this week, then next week or later.</p></div></li>
            <li><span>03</span><div><strong>Confirm</strong><p>Pick the exact time and finish booking on Google.</p></div></li>
          </ol>
        </section>

        {message ? (
          <div className="source-error" role="alert">
            <div><strong>Couldn’t refresh the volunteer list.</strong><span>{message}</span></div>
            <button onClick={() => void refresh()} type="button">Try again</button>
          </div>
        ) : null}

        <section className="panel sessions-panel" id="session-finder" aria-labelledby="finder-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live Google availability</p>
              <h2 id="finder-title">Find your appointment</h2>
              <p>Scan everyone or search for a volunteer. The most useful confirmed openings will appear first.</p>
            </div>
            <button className="text-button" disabled={!Object.keys(slotResults).length} onClick={clearResults} type="button">Clear results</button>
          </div>

          <div className="source-strip" aria-label="Volunteer list status">
            <div className="source-state">
              <span className="live-dot" aria-hidden="true" />
              <span><strong>{availability?.bookingPages.length ?? "—"} calendars loaded</strong><small>Updated {displayTime(availability?.checkedAt)}</small></span>
            </div>
            <div className="source-actions">
              <a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Official list <span aria-hidden="true">↗</span></a>
              <button className="utility-button" disabled={loading} onClick={() => void refresh()} type="button">{loading ? "Refreshing…" : "Refresh list"}</button>
            </div>
          </div>

          <p className="trust-note">
            <strong>What is checked:</strong> Google’s live appointment times. A failed check is never shown as “no openings.”
          </p>

          {resultsExpired ? (
            <div className="expiry-note" role="status">
              <span><strong>Your earlier results expired.</strong> Availability changes quickly, so scan again for a current answer.</span>
              <button className="utility-button" onClick={requestScan} type="button">Scan again</button>
            </div>
          ) : null}

          <div className="finder-controls">
            <label className="search-field">
              <span>Volunteer name</span>
              <input onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" type="search" value={query} />
            </label>
            <button
              disabled={scan?.state === "running" || hasActiveCheck || searchedPages.length === 0}
              onClick={requestScan}
              type="button"
            >
              {query ? `Scan ${searchedPages.length} match${searchedPages.length === 1 ? "" : "es"}` : `Scan all ${searchedPages.length}`}
            </button>
            {scan?.state === "running" ? <button className="danger-button" onClick={stopScan} type="button">Stop scan</button> : null}
          </div>

          <div className="desktop-filters" aria-label="Filter volunteer results">
            {FILTERS.map((item) => {
              const range = item.value === "this_week" ? thisWeekLabel : item.value === "next_week" ? nextWeekLabel : "";
              const count = filterCount(item.value);
              return (
                <button
                  aria-label={`${item.label}${range ? `, ${range}` : ""}: ${count}`}
                  aria-pressed={filter === item.value}
                  className="filter-chip"
                  disabled={item.value !== "best" && count === 0}
                  key={item.value}
                  onClick={() => setFilter(item.value)}
                  type="button"
                >
                  <span><span>{item.label}</span>{range ? <small>{range}</small> : null}</span>
                  <b>{count}</b>
                </button>
              );
            })}
          </div>

          <label className="mobile-filter">
            <span>Showing</span>
            <select onChange={(event) => setFilter(event.target.value as ResultFilter)} value={filter}>
              {FILTERS.map((item) => <option disabled={item.value !== "best" && filterCount(item.value) === 0} key={item.value} value={item.value}>{item.label} ({filterCount(item.value)})</option>)}
              <option disabled={counts.none_in_view === 0} value="none_in_view">No openings ({counts.none_in_view})</option>
              <option disabled={counts.not_checked === 0} value="not_checked">Not checked ({counts.not_checked})</option>
            </select>
          </label>

          {confirmScan ? (
            <div className="confirm-card" role="alert">
              <div><strong>Check {searchedPages.length} volunteer calendars?</strong><span>You can stop at any time and keep every completed result.</span></div>
              <div><button onClick={() => void startScan()} type="button">Start scan</button><button className="secondary-button" onClick={() => setConfirmScan(false)} type="button">Cancel</button></div>
            </div>
          ) : null}

          {scan ? (
            <section className={`scan-receipt ${scan.state}`} aria-busy={scan.state === "running"} aria-live="polite">
              <div className="receipt-heading">
                <div>
                  <p className="receipt-kicker">{scan.state === "running" ? "Live scan" : scan.state === "complete" ? "Scan complete" : "Scan paused"}</p>
                  <h3>
                    {scan.state === "running"
                      ? `Checking ${scan.scope}`
                      : scan.state === "complete"
                        ? scanCounts.available
                          ? `${scanCounts.available} volunteer${scanCounts.available === 1 ? "" : "s"} with open times`
                          : "No confirmed openings right now"
                        : `${scan.completed} of ${scan.total} calendars checked`}
                  </h3>
                </div>
                <strong className="receipt-progress">{Math.round((scan.completed / scan.total) * 100)}%</strong>
              </div>
              <div className="progress-track" aria-hidden="true"><span style={{ width: `${(scan.completed / scan.total) * 100}%` }} /></div>
              <p className="receipt-scope">
                {scan.completed} of {scan.total} checked
                <span aria-hidden="true">·</span>
                {scan.state === "running" ? "Fast scan enabled" : `Finished ${displayClock(scan.finishedAt)}`}
                {scanRange ? <><span aria-hidden="true">·</span> Range: {scanRange}</> : null}
              </p>
              <div className="receipt-metrics">
                {scanCounts.available > 0 ? <span className="positive"><b>{scanCounts.available}</b> open</span> : null}
                {scanCounts.thisWeek > 0 ? <span><b>{scanCounts.thisWeek}</b> this week</span> : null}
                {scanCounts.nextWeek > 0 ? <span><b>{scanCounts.nextWeek}</b> next week</span> : null}
                {scanCounts.later > 0 ? <span><b>{scanCounts.later}</b> later</span> : null}
                {scanCounts.none > 0 ? <span><b>{scanCounts.none}</b> no openings</span> : null}
                {scanCounts.attention > 0 ? <span className="attention"><b>{scanCounts.attention}</b> need another look</span> : null}
              </div>
              {scan.state === "complete" ? (
                <div className="receipt-next">
                  <div><strong>What to do next</strong><p>{scanGuidance}</p><small>Results stay on this device for 30 minutes.</small></div>
                  {scanCounts.available ? (
                    <button className="receipt-action" onClick={() => setFilter(recommendedResultFilter)} type="button">{recommendedResultLabel}</button>
                  ) : scanCounts.attention ? (
                    <button className="receipt-action" onClick={() => setFilter("needs_attention")} type="button">Retry these checks</button>
                  ) : (
                    <a className="receipt-action" href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Open official schedule <span aria-hidden="true">↗</span></a>
                  )}
                </div>
              ) : null}
              {scan.state === "stopped" && scan.completed < scan.total ? (
                <div className="receipt-next">
                  <div><strong>Your completed results are safe.</strong><p>Continue whenever you’re ready; only the unchecked calendars will run.</p></div>
                  <button className="receipt-action" onClick={scanRemaining} type="button">Check remaining</button>
                </div>
              ) : null}
            </section>
          ) : null}

          <details className="result-help">
            <summary>How to read these results</summary>
            <div>
              <p><strong>Open:</strong> Google returned at least one appointment time.</p>
              <p><strong>No openings:</strong> Google returned no times in the stated scan range.</p>
              <p><strong>Needs attention:</strong> the check could not be confirmed. Try again or open Google directly.</p>
            </div>
          </details>

          <div className="results-heading">
            <div><p className="eyebrow">Results</p><h3>{filter === "best" ? "Best available choices" : FILTERS.find((item) => item.value === filter)?.label ?? (filter === "none_in_view" ? "No openings" : "Not checked")}</h3></div>
            <span>{visiblePages.length} volunteer{visiblePages.length === 1 ? "" : "s"}</span>
          </div>

          <div className="result-sections">
            {sections.map((section) => (
              <section className="result-group" key={section.key} aria-labelledby={`group-${section.key}`}>
                <div className="group-heading">
                  <h3 id={`group-${section.key}`}>{SECTION_LABELS[section.key]}</h3>
                  <span>
                    {section.key === "this_week" ? thisWeekLabel : section.key === "next_week" ? nextWeekLabel : `${section.pages.length} result${section.pages.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="result-card-list">{section.pages.map(renderCard)}</div>
              </section>
            ))}
            {!loading && visiblePages.length === 0 ? (
              <div className="empty-state">
                <span className="empty-mark" aria-hidden="true">○</span>
                <strong>{searchedPages.length === 0 ? "No volunteer matches that name." : scan?.state === "complete" ? "No confirmed opening in this view." : "Nothing to show yet."}</strong>
                <span>{searchedPages.length === 0 ? "Check the spelling or clear the search." : scan?.state === "complete" ? "Try another filter, scan again later, or use the official schedule." : "Scan the live calendars to see current appointment times."}</span>
                <div>
                  {query ? <button className="secondary-button" onClick={() => setQuery("")} type="button">Clear search</button> : null}
                  <button className="secondary-button" onClick={() => setFilter("best")} type="button">Show best results</button>
                </div>
              </div>
            ) : null}
          </div>

          {filter !== "none_in_view" && counts.none_in_view > 0 ? (
            <details className="no-opening-disclosure">
              <summary><span><strong>{counts.none_in_view} calendar{counts.none_in_view === 1 ? "" : "s"} returned no openings</strong><small>Hidden so the useful choices stay easy to scan.</small></span><span>Review</span></summary>
              <div><p>These checks completed successfully; Google returned no appointment times in the checked range.</p><button className="secondary-button" onClick={() => setFilter("none_in_view")} type="button">Show these calendars</button></div>
            </details>
          ) : null}
        </section>

        <footer className="site-footer" id="about">
          <div className="footer-brand"><strong>English Chat Finder</strong><span>Designed and built by Papa Kojo Mensah</span><small>An independent student-built helper for finding English Chat appointments.</small></div>
          <nav aria-label="Helpful links"><a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Official schedule <span aria-hidden="true">↗</span></a><a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Prepare for your session <span aria-hidden="true">↗</span></a></nav>
          <div className="footer-notes"><span>No sign-in</span><span>No server storage</span><span>Results expire after 30 minutes</span></div>
        </footer>
      </main>
    </>
  );
}
