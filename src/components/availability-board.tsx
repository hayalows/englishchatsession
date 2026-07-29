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
type ScanMode = "all" | "name";
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
  const [scanMode, setScanMode] = useState<ScanMode>("all");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("best");
  const [scan, setScan] = useState<ScanReport | null>(null);
  const [showScanControls, setShowScanControls] = useState(false);
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
    if (scanMode === "all") return bookingPages;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [];
    return bookingPages.filter((booking) => (booking.tutor ?? "English Chat volunteer").toLocaleLowerCase().includes(normalizedQuery));
  }, [bookingPages, query, scanMode]);
  const resultPages = useMemo(() => {
    if (!scan?.urls.length) return scanMode === "name" && query.trim() ? searchedPages : bookingPages;
    const scanUrls = new Set(scan.completedUrls);
    return bookingPages.filter((booking) => scanUrls.has(booking.bookingUrl));
  }, [bookingPages, query, scan, scanMode, searchedPages]);
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
    for (const booking of resultPages) {
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
  }, [localNow, resultPages, slotResults]);

  const visiblePages = useMemo(() => {
    if (!localNow) return [];
    return resultPages
      .filter((booking) => {
        const result = slotResults[booking.bookingUrl];
        const section = resultSection(result, localNow);
        if (filter === "best") {
          if (counts.available > 0) return result?.status === "available";
          if (scan?.state === "complete") return counts.needs_attention > 0 && section === "needs_attention";
          if (scan?.state === "running") return false;
          return result?.status === "available";
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
  }, [counts.available, counts.needs_attention, filter, localNow, resultPages, scan?.state, slotResults]);

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
  const hasResultData = useMemo(() => Object.values(slotResults).some((result) => VALID_STATUSES.has(result.status)), [slotResults]);
  const hasSavedScanState = Boolean(scan || hasResultData);
  const showResultsPanel = scan?.state === "running"
    || counts.available > 0
    || counts.needs_attention > 0
    || Boolean(scan?.state === "stopped" && scan.completed > 0);

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

  async function startScan(pages = searchedPages, resumeFrom?: ScanReport) {
    const queue = pages.slice();
    if (!queue.length) return;
    setShowScanControls(false);
    setResultsExpired(false);
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    let nextIndex = 0;
    const completedUrls = resumeFrom?.completedUrls ?? [];
    let completed = completedUrls.length;
    const startedAt = resumeFrom?.startedAt ?? new Date().toISOString();
    const scope = resumeFrom?.scope ?? (
      scanMode === "name" && query.trim()
        ? `${queue.length} volunteer${queue.length === 1 ? "" : "s"} matching “${query.trim()}”`
        : queue.length === bookingPages.length
          ? `all ${queue.length} volunteer calendars`
          : `${queue.length} selected volunteer calendars`
    );
    setScan({
      state: "running",
      completed,
      completedUrls,
      total: resumeFrom?.total ?? queue.length,
      urls: resumeFrom?.urls ?? queue.map((page) => page.bookingUrl),
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
    void startScan(remainingPages, scan);
  }

  function requestScan() {
    void startScan();
  }

  function clearResults() {
    localStorage.removeItem(STORAGE_KEY);
    setSlotResults({});
    setScan(null);
    setFilter("best");
    setShowScanControls(false);
    setResultsExpired(false);
  }

  function selectScanMode(nextMode: ScanMode) {
    setScanMode(nextMode);
    if (nextMode === "all") setQuery("");
  }

  function showRecommendedResults() {
    setFilter(recommendedResultFilter);
    window.requestAnimationFrame(() => document.querySelector("#availability-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function showResultFilter(nextFilter: ResultFilter) {
    setFilter(nextFilter);
    window.requestAnimationFrame(() => document.querySelector("#availability-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openScanControls() {
    setShowScanControls(true);
    window.requestAnimationFrame(() => document.querySelector("#session-finder")?.scrollIntoView({ behavior: "smooth", block: "center" }));
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
            className={result.status === "available" ? "secondary-button" : "check-button"}
            disabled={hasActiveCheck || scan?.state === "running"}
            onClick={() => void checkTutor(booking.bookingUrl)}
            type="button"
          >
            {result.status === "checking"
              ? "Checking…"
              : result.status === "not_checked"
                ? "Check availability"
                : result.status === "available"
                  ? "Refresh result"
                  : "Try this check again"}
          </button>
          <a
            className={result.status === "available" ? "booking-link primary" : "booking-link tertiary"}
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
              <small>Find available volunteer sessions</small>
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
            <h1 id="page-title">Find an available English Chat session.</h1>
            <p className="lede">Search live volunteer calendars and choose your appointment on Google.</p>
            <div className="hero-facts" aria-label="English Chat facts">
              <span>Free</span><span>30 minutes</span><span>2 sessions weekly</span><span>Online</span>
            </div>
            <a className="hero-help-link" href="#how-it-works">New to English Chat? See how it works <span aria-hidden="true">↓</span></a>
          </div>

          <aside className="quick-finder" id="session-finder" aria-labelledby="finder-title">
            <div className="quick-finder-heading">
              <div>
                <p className="eyebrow">Live availability</p>
                <h2 id="finder-title">Find a session</h2>
              </div>
              {hasSavedScanState && scan?.state !== "running" ? (
                <button className="quiet-button" onClick={clearResults} type="button">Clear results</button>
              ) : null}
            </div>

            {message ? (
              <div className="finder-alert" role="alert">
                <div><strong>Volunteer list unavailable</strong><span>{message}</span></div>
                <button onClick={() => void refresh()} type="button">Try again</button>
              </div>
            ) : null}

            {resultsExpired ? (
              <div className="finder-notice" role="status">
                <div><strong>These results are no longer current</strong><span>Availability changes quickly. Scan again before booking.</span></div>
                <button className="secondary-button" disabled={!bookingPages.length} onClick={requestScan} type="button">Scan again</button>
              </div>
            ) : null}

            {scan?.state === "running" ? (
              <div className="finder-progress" aria-busy="true" aria-live="polite">
                <div className="finder-progress-heading">
                  <div><span className="state-label">Scanning live calendars</span><strong>{scan.completed} of {scan.total} checked</strong></div>
                  <b>{Math.round((scan.completed / scan.total) * 100)}%</b>
                </div>
                <div
                  aria-label={`${scan.completed} of ${scan.total} calendars checked`}
                  aria-valuemax={scan.total}
                  aria-valuemin={0}
                  aria-valuenow={scan.completed}
                  className="progress-track"
                  role="progressbar"
                >
                  <span style={{ width: `${(scan.completed / scan.total) * 100}%` }} />
                </div>
                <p>Openings appear in the results as they are confirmed. You can stop without losing completed checks.</p>
                <div className="finder-progress-footer">
                  <span>Fast scan enabled</span>
                  <button className="stop-button" onClick={stopScan} type="button">Stop scan</button>
                </div>
              </div>
            ) : scan && !showScanControls ? (
              <div className={`finder-outcome ${scan.state}`}>
                <span className="state-label">{scan.state === "complete" ? "Scan complete" : "Scan paused"}</span>
                <h3>
                  {scan.state === "stopped"
                    ? `${scan.completed} of ${scan.total} calendars checked`
                    : scanCounts.available
                      ? `${scanCounts.available} volunteer${scanCounts.available === 1 ? "" : "s"} with open times`
                      : scanCounts.attention
                        ? "No opening confirmed yet"
                        : "No confirmed openings right now"}
                </h3>
                <p>{scan.state === "stopped" ? "Completed checks are still available below. Continue when you are ready." : scanGuidance}</p>
                <div className="outcome-facts" aria-label="Scan summary">
                  {scanCounts.thisWeek > 0 ? <span><b>{scanCounts.thisWeek}</b> this week</span> : null}
                  {scanCounts.nextWeek > 0 ? <span><b>{scanCounts.nextWeek}</b> next week</span> : null}
                  {scanCounts.later > 0 ? <span><b>{scanCounts.later}</b> later</span> : null}
                  {scanCounts.attention > 0 ? <span><b>{scanCounts.attention}</b> need another look</span> : null}
                </div>
                {scanRange ? <small>Google range checked: {scanRange}</small> : null}
                <div className="outcome-actions">
                  {scan.state === "stopped" && scan.completed < scan.total ? (
                    <button onClick={scanRemaining} type="button">Continue scan</button>
                  ) : scanCounts.available ? (
                    <button onClick={showRecommendedResults} type="button">{recommendedResultLabel}</button>
                  ) : scanCounts.attention ? (
                    <button onClick={() => showResultFilter("needs_attention")} type="button">Review these checks</button>
                  ) : (
                    <a className="button-link" href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Check official schedule <span aria-hidden="true">↗</span></a>
                  )}
                  <button className="secondary-button" onClick={openScanControls} type="button">New search</button>
                </div>
              </div>
            ) : (
              <div className="finder-setup">
                <div className="scan-mode-options" role="group" aria-label="Choose how to find a session">
                  <button aria-pressed={scanMode === "all"} onClick={() => selectScanMode("all")} type="button">
                    <span>Scan everyone</span><small>Best chance</small>
                  </button>
                  <button aria-pressed={scanMode === "name"} onClick={() => selectScanMode("name")} type="button">
                    <span>Search by name</span><small>Check a volunteer</small>
                  </button>
                </div>

                {scanMode === "name" ? (
                  <div className="finder-search">
                    <label className="search-field">
                      <span>Volunteer name</span>
                      <input
                        aria-describedby="name-search-help"
                        autoComplete="off"
                        list="volunteer-names"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Start typing a name"
                        type="search"
                        value={query}
                      />
                    </label>
                    <datalist id="volunteer-names">
                      {bookingPages.map((booking) => booking.tutor ? <option key={booking.bookingUrl} value={booking.tutor} /> : null)}
                    </datalist>
                    <p id="name-search-help" aria-live="polite">
                      {!query.trim()
                        ? "Choose a name from the suggestions or continue typing."
                        : searchedPages.length
                          ? `${searchedPages.length} matching volunteer${searchedPages.length === 1 ? "" : "s"} ready to check.`
                          : "No matching volunteer. Check the spelling or scan everyone."}
                    </p>
                  </div>
                ) : (
                  <div className="finder-mode-copy">
                    <strong>Best chance of finding an opening</strong>
                    <span>We will check every volunteer and put confirmed openings first.</span>
                  </div>
                )}

                <button
                  className="scan-primary"
                  disabled={hasActiveCheck || loading || searchedPages.length === 0}
                  onClick={requestScan}
                  type="button"
                >
                  {loading
                    ? "Loading volunteers…"
                    : scanMode === "all"
                      ? `Scan all ${searchedPages.length} volunteers`
                      : query.trim()
                        ? `Check ${searchedPages.length} matching volunteer${searchedPages.length === 1 ? "" : "s"}`
                        : "Enter a volunteer name"}
                </button>
              </div>
            )}

            <div className="finder-source" aria-label="Volunteer list status">
              <span className={`live-dot ${message ? "error" : ""}`} aria-hidden="true" />
              <span>
                <strong>{loading ? "Loading volunteer list" : availability ? `${bookingPages.length} volunteers ready` : "Volunteer list unavailable"}</strong>
                {availability ? <small>Updated {displayTime(availability.checkedAt)}</small> : null}
              </span>
              <button className="source-refresh" disabled={loading} onClick={() => void refresh()} type="button">{loading ? "Refreshing…" : "Refresh"}</button>
            </div>

            <details className="finder-trust">
              <summary>How availability is checked</summary>
              <p>We ask Google for each volunteer’s live appointment times. A failed check is never counted as “no openings.”</p>
              <a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Open the official volunteer list <span aria-hidden="true">↗</span></a>
            </details>
          </aside>
        </section>

        {showResultsPanel ? (
        <section className="panel results-panel" id="availability-results" aria-labelledby="results-title">
          <div className="results-overview">
            <div>
              <p className="eyebrow">{scan?.state === "running" ? "Live results" : "Your results"}</p>
              <h2 id="results-title">
                {scan?.state === "running"
                  ? "Confirmed openings appear here"
                  : scan?.state === "complete"
                    ? scanCounts.available
                      ? `${scanCounts.available} open volunteer calendar${scanCounts.available === 1 ? "" : "s"}`
                      : scanCounts.attention
                        ? "Some calendars need another look"
                        : "No confirmed openings right now"
                    : scan?.state === "stopped"
                      ? "Results from completed checks"
                      : "Recent availability results"}
              </h2>
              <p>
                {scan?.state === "running"
                  ? "You can review confirmed openings while the remaining calendars continue."
                  : "Openings are ordered by the dates most useful for your weekly English Chat goal."}
              </p>
            </div>
            <div className="results-actions">
              <button className="secondary-button" onClick={openScanControls} type="button">New search</button>
              <button className="quiet-button" onClick={clearResults} type="button">Clear</button>
            </div>
          </div>

          {counts.available > 0 || (scan?.state !== "running" && counts.needs_attention > 0) ? (
            <>
              <div className="desktop-filters" aria-label="Filter volunteer results">
                {FILTERS.filter((item) => filterCount(item.value) > 0).map((item) => {
                  const range = item.value === "this_week" ? thisWeekLabel : item.value === "next_week" ? nextWeekLabel : "";
                  const count = filterCount(item.value);
                  return (
                    <button
                      aria-label={`${item.label}${range ? `, ${range}` : ""}: ${count}`}
                      aria-pressed={filter === item.value}
                      className="filter-chip"
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
                  {FILTERS.filter((item) => filterCount(item.value) > 0).map((item) => (
                    <option key={item.value} value={item.value}>{item.label} ({filterCount(item.value)})</option>
                  ))}
                  {filter === "none_in_view" ? <option value="none_in_view">No openings ({counts.none_in_view})</option> : null}
                </select>
              </label>
            </>
          ) : null}

          {counts.available > 0 || (scan?.state !== "running" && counts.needs_attention > 0) ? <details className="result-help">
            <summary>How to read these results</summary>
            <div>
              <p><strong>Open:</strong> Google returned at least one appointment time.</p>
              <p><strong>No openings:</strong> Google returned no times in the stated scan range.</p>
              <p><strong>Needs attention:</strong> the check could not be confirmed. Try again or open Google directly.</p>
            </div>
          </details> : null}

          {counts.available > 0 || (scan?.state !== "running" && counts.needs_attention > 0) ? <div className="results-heading">
            <div><p className="eyebrow">Results</p><h3>{filter === "best" ? "Best available choices" : FILTERS.find((item) => item.value === filter)?.label ?? (filter === "none_in_view" ? "No openings" : "Not checked")}</h3></div>
            <span>{visiblePages.length} volunteer{visiblePages.length === 1 ? "" : "s"}</span>
          </div> : null}

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
            {!loading && scan && visiblePages.length === 0 ? (
              <div className="empty-state">
                <span className={scan.state === "running" ? "scan-spinner" : "empty-mark"} aria-hidden="true">{scan.state === "running" ? "" : "○"}</span>
                <strong>{scan.state === "running" ? "Scanning live calendars…" : filter === "none_in_view" ? "No calendars in this group." : "No confirmed openings in this view."}</strong>
                <span>{scan.state === "running" ? "Useful results will appear here as soon as Google confirms them." : "Try another result group, start a new search, or check the official schedule."}</span>
                <div>
                  {scan.state !== "running" && counts.available > 0 ? <button onClick={showRecommendedResults} type="button">Show best openings</button> : null}
                  {scan.state !== "running" ? <button className="secondary-button" onClick={openScanControls} type="button">New search</button> : null}
                </div>
              </div>
            ) : null}
          </div>

          {scan?.state !== "running" && filter !== "none_in_view" && counts.none_in_view > 0 ? (
            <details className="no-opening-disclosure">
              <summary><span><strong>{counts.none_in_view} calendar{counts.none_in_view === 1 ? "" : "s"} returned no openings</strong><small>Hidden so the useful choices stay easy to scan.</small></span><span>Review</span></summary>
              <div><p>These checks completed successfully; Google returned no appointment times in the checked range.</p><button className="secondary-button" onClick={() => setFilter("none_in_view")} type="button">Show these calendars</button></div>
            </details>
          ) : null}
        </section>
        ) : null}

        <section className="weekly-route" id="how-it-works" aria-labelledby="weekly-route-title">
          <div className="route-heading">
            <p className="eyebrow">Your weekly flow</p>
            <h2 id="weekly-route-title">From search to session</h2>
          </div>
          <ol>
            <li><span>01</span><div><strong>Find</strong><p>Scan everyone for the best chance, or search for one volunteer.</p></div></li>
            <li><span>02</span><div><strong>Choose</strong><p>Start with this week, then check next week or later.</p></div></li>
            <li><span>03</span><div><strong>Book on Google</strong><p>Choose the exact time and complete the official booking.</p></div></li>
          </ol>
        </section>

        <footer className="site-footer" id="about">
          <div className="footer-brand"><strong>English Chat Finder</strong><small>Helping students find available English Chat volunteer sessions.</small><span>Designed and built by Papa Kojo Mensah</span></div>
          <nav aria-label="Helpful links"><a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Official schedule <span aria-hidden="true">↗</span></a><a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Prepare for your session <span aria-hidden="true">↗</span></a></nav>
          <p className="footer-guidance">Availability is checked from Google Calendar. Confirm and book the exact time on Google.</p>
        </footer>
      </main>
    </>
  );
}
