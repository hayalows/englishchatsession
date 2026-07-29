"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CompletedScanOutcome } from "@/components/completed-scan-outcome";
import { getWeekWindow } from "@/lib/date-window";
import {
  type BookingUrlCatalog,
  type LinkHealthMap,
  type LinkHealthReason,
  isLinkPaused,
  markLinkHealthy,
  markLinkPaused,
  planLinkChecks,
  reconcileLinkHealth,
  SCHEDULE_UNAVAILABLE_COOLDOWN_MS,
  TEMPORARY_FAILURE_COOLDOWN_MS,
} from "@/lib/link-health";
import type { SlotResult, TutorCheckStatus } from "@/lib/monitoring/results";
import { runProgressiveScan } from "@/lib/progressive-scan";
import {
  chooseRecommendedView,
  countAvailableTimes,
  datesInUserTime,
  earliestAvailableTime,
  hasDateInWeek,
  openingGroup,
  type OpeningGroup,
} from "@/lib/result-presentation";
import { normalizeStoredScan, type StoredScanReport } from "@/lib/saved-scan";
import { fetchSlotResult, SlotRequestError } from "@/lib/slot-request";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };
type ScanMode = "all" | "name";
type ResultFilter = "best" | "this_week" | "next_week" | "later";
type ResultSection = OpeningGroup | "needs_attention" | "none_in_view" | "not_checked";
type ScanReport = StoredScanReport;
type StoredResults = {
  version: 2 | 3;
  savedAt: string;
  results: Record<string, SlotResult>;
  scan?: ScanReport;
};
type StoredLinkHealth = {
  version: 1;
  savedAt: string;
  health: LinkHealthMap;
  catalog: BookingUrlCatalog;
};

const STORAGE_KEY = "english-chat-booking-results:v2";
const LINK_HEALTH_STORAGE_KEY = "english-chat-link-health:v1";
const RESULT_STALE_AFTER_MS = 10 * 60 * 1000;
const RESULT_RETENTION_MS = 24 * 60 * 60 * 1000;
const DIRECT_HTTP_SCAN_CONCURRENCY = 10;
const VALID_STATUSES = new Set<TutorCheckStatus>(["available", "none_in_view", "unknown", "failed"]);
const OFFICIAL_SCHEDULE = "https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0";
const PREPARE_PAGE = "https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0";

const FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "best", label: "Best openings" },
  { value: "this_week", label: "This week" },
  { value: "next_week", label: "Next week" },
  { value: "later", label: "Later" },
];

const SECTION_LABELS: Record<OpeningGroup, string> = {
  this_week: "Open this week",
  next_week: "Open next week",
  later: "Open later",
};

function displayTime(value?: string | null) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Not checked yet";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
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

function displayCheckedRange(start?: string, end?: string) {
  if (!start || !end) return "";
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) return "";
  return `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(startDate)}–${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(endDate)}`;
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

function isCurrent(value?: string) {
  return Boolean(value && Date.now() - new Date(value).valueOf() < RESULT_STALE_AFTER_MS);
}

function isRetained(value?: string) {
  return Boolean(value && Date.now() - new Date(value).valueOf() < RESULT_RETENTION_MS);
}

function readStoredResults() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as StoredResults | null;
    if (!saved || (saved.version !== 2 && saved.version !== 3) || typeof saved.results !== "object") {
      return { results: {}, expired: false, scan: null };
    }
    const results = Object.fromEntries(
      Object.entries(saved.results).filter(([, result]) => result && VALID_STATUSES.has(result.status) && isRetained(result.checkedAt)),
    );
    return {
      results,
      expired: Object.values(results).some((result) => !isCurrent(result.checkedAt)),
      scan: saved.version === 3 ? normalizeStoredScan(saved.scan, saved.savedAt) : null,
    };
  } catch {
    return { results: {}, expired: false, scan: null };
  }
}

function readStoredLinkHealth() {
  try {
    const saved = JSON.parse(localStorage.getItem(LINK_HEALTH_STORAGE_KEY) ?? "null") as StoredLinkHealth | null;
    if (!saved || saved.version !== 1 || typeof saved.health !== "object" || typeof saved.catalog !== "object") {
      return { health: {}, catalog: {} };
    }
    return { health: saved.health, catalog: saved.catalog };
  } catch {
    return { health: {}, catalog: {} };
  }
}

function temporaryHealthReason(error: unknown): Exclude<LinkHealthReason, "confirmed_dates" | "confirmed_empty_range" | "schedule_unavailable"> {
  if (error instanceof SlotRequestError && error.status === 429) return "rate_limited";
  if (
    (error instanceof SlotRequestError && error.status === 504)
    || (error instanceof Error && (error.name === "TimeoutError" || /timed? out/i.test(error.message)))
  ) {
    return "request_timeout";
  }
  return "temporary_provider_failure";
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
  const [linkHealth, setLinkHealth] = useState<LinkHealthMap>({});
  const [bookingUrlCatalog, setBookingUrlCatalog] = useState<BookingUrlCatalog>({});
  const [linkHealthLoaded, setLinkHealthLoaded] = useState(false);
  const [healthNow, setHealthNow] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const autoSelectedRef = useRef<string | null>(null);
  const outcomeRef = useRef<HTMLDivElement | null>(null);
  const linkHealthRef = useRef<LinkHealthMap>({});
  const bookingUrlCatalogRef = useRef<BookingUrlCatalog>({});

  const updateLinkHealth = useCallback((updater: (current: LinkHealthMap) => LinkHealthMap) => {
    setLinkHealth((current) => {
      const next = updater(current);
      linkHealthRef.current = next;
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/availability", { cache: "no-store" });
      const payload = (await response.json()) as Availability & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Unable to read the English Chat scheduling page.");
      const reconciled = reconcileLinkHealth(
        linkHealthRef.current,
        bookingUrlCatalogRef.current,
        payload.bookingPages,
      );
      linkHealthRef.current = reconciled.health;
      bookingUrlCatalogRef.current = reconciled.catalog;
      setLinkHealth(reconciled.health);
      setBookingUrlCatalog(reconciled.catalog);
      setAvailability(payload);
      const validUrls = new Set(payload.bookingPages.map((page) => page.bookingUrl));
      setSlotResults((current) => Object.fromEntries(
        Object.entries(current).filter(([url, result]) => validUrls.has(url) && (result.status === "checking" || isRetained(result.checkedAt))),
      ));
      setScan((current) => {
        if (!current) return current;
        const completedUrls = current.completedUrls.filter((url) => validUrls.has(url));
        const urls = current.urls.filter((url) => validUrls.has(url));
        if (!completedUrls.length && !urls.length) return null;
        return { ...current, completedUrls, urls };
      });
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
    setHealthNow(Date.now());
    const timer = window.setInterval(() => setHealthNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const stored = readStoredResults();
    const storedHealth = readStoredLinkHealth();
    setSlotResults(stored.results);
    setResultsExpired(stored.expired);
    setScan(stored.scan);
    linkHealthRef.current = storedHealth.health;
    bookingUrlCatalogRef.current = storedHealth.catalog;
    setLinkHealth(storedHealth.health);
    setBookingUrlCatalog(storedHealth.catalog);
    setLinkHealthLoaded(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSlotResults((current) => Object.fromEntries(
        Object.entries(current).filter(([, result]) => result.status === "checking" || !VALID_STATUSES.has(result.status) || isRetained(result.checkedAt)),
      ));
      setResultsExpired(Object.values(slotResults).some((result) => VALID_STATUSES.has(result.status) && !isCurrent(result.checkedAt)));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [slotResults]);

  useEffect(() => {
    if (!linkHealthLoaded) return;
    try {
      localStorage.setItem(LINK_HEALTH_STORAGE_KEY, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        health: linkHealth,
        catalog: bookingUrlCatalog,
      } satisfies StoredLinkHealth));
    } catch {
      // Browser storage is optional.
    }
  }, [bookingUrlCatalog, linkHealth, linkHealthLoaded]);

  useEffect(() => {
    const persisted = Object.fromEntries(
      Object.entries(slotResults).filter(([, result]) => VALID_STATUSES.has(result.status) && isRetained(result.checkedAt)),
    );
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 3,
        savedAt: new Date().toISOString(),
        results: persisted,
        scan: scan
          ? {
            ...scan,
            state: scan.state === "running" ? "stopped" : scan.state,
            finishedAt: scan.state === "running" ? new Date().toISOString() : scan.finishedAt,
          }
          : undefined,
      } satisfies StoredResults));
    } catch {
      // Browser storage is optional.
    }
  }, [scan, slotResults]);

  const bookingPages = useMemo(() => availability?.bookingPages ?? [], [availability]);
  const pausedLinkCount = useMemo(() => healthNow === null
    ? 0
    : bookingPages.filter((page) => isLinkPaused(linkHealth[page.bookingUrl], healthNow)).length,
  [bookingPages, healthNow, linkHealth]);
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
        if (filter === "best") return result?.status === "available";
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
  }, [filter, localNow, resultPages, slotResults]);

  const sections = useMemo(() => {
    if (!localNow) return [] as { key: OpeningGroup; pages: BookingPage[] }[];
    const grouped = new Map<OpeningGroup, BookingPage[]>();
    for (const page of visiblePages) {
      const key = resultSection(slotResults[page.bookingUrl], localNow);
      if (key !== "this_week" && key !== "next_week" && key !== "later") continue;
      grouped.set(key, [...(grouped.get(key) ?? []), page]);
    }
    const order: OpeningGroup[] = ["this_week", "next_week", "later"];
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
      unavailable: completedUrls.filter((url) => slotResults[url]?.reasonCode === "schedule_unavailable").length,
      unverified: completedUrls.filter((url) => {
        const result = slotResults[url];
        return (result?.status === "unknown" || result?.status === "failed") && result.reasonCode !== "schedule_unavailable";
      }).length,
    };
  }, [localNow, scan, slotResults]);

  const scanRange = useMemo(() => (scan?.completedUrls ?? [])
    .map((url) => slotResults[url]?.checkedRange)
    .find(Boolean), [scan, slotResults]);
  const singleScannedTutor = useMemo(() => {
    if (!scan || scan.urls.length !== 1) return null;
    const targetUrl = scan.urls[0];
    return bookingPages.find((booking) => booking.bookingUrl === targetUrl)?.tutor ?? "this volunteer";
  }, [bookingPages, scan]);
  const hasResultData = useMemo(() => Object.values(slotResults).some((result) => VALID_STATUSES.has(result.status)), [slotResults]);
  const hasSavedScanState = Boolean(scan || hasResultData);
  const showResultsPanel = Boolean(scan && counts.available > 0);

  useEffect(() => {
    if (!scan || scan.state === "running" || autoSelectedRef.current === scan.startedAt) return;
    const nextFilter: ResultFilter = scanCounts.available
      ? chooseRecommendedView(scanCounts)
      : "best";
    setFilter(nextFilter);
    autoSelectedRef.current = scan.startedAt;
  }, [scan, scanCounts]);

  useEffect(() => {
    if (!scan || scan.state === "running") return;
    window.requestAnimationFrame(() => outcomeRef.current?.focus());
  }, [scan?.finishedAt, scan?.state]);

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
        const checkedAt = result.checkedAt ?? new Date().toISOString();
        if (result.status === "available" && result.reasonCode === "confirmed_dates") {
          updateLinkHealth((current) => markLinkHealthy(current, bookingUrl, checkedAt, "confirmed_dates"));
        } else if (result.status === "none_in_view" && result.reasonCode === "confirmed_empty_range") {
          updateLinkHealth((current) => markLinkHealthy(current, bookingUrl, checkedAt, "confirmed_empty_range"));
        } else if (result.reasonCode === "schedule_unavailable") {
          updateLinkHealth((current) => markLinkPaused(
            current,
            bookingUrl,
            checkedAt,
            "schedule_unavailable",
            SCHEDULE_UNAVAILABLE_COOLDOWN_MS,
          ));
        } else if (result.reasonCode === "request_failed") {
          updateLinkHealth((current) => markLinkPaused(
            current,
            bookingUrl,
            checkedAt,
            "temporary_provider_failure",
            TEMPORARY_FAILURE_COOLDOWN_MS,
          ));
        }
        setSlotResults((current) => ({ ...current, [bookingUrl]: result }));
      }
      return { result, rateLimited: false };
    } catch (error) {
      if ((error as Error).name !== "AbortError" && (runId === undefined || runId === runIdRef.current)) {
        const checkedAt = new Date().toISOString();
        const healthReason = temporaryHealthReason(error);
        updateLinkHealth((current) => markLinkPaused(
          current,
          bookingUrl,
          checkedAt,
          healthReason,
          TEMPORARY_FAILURE_COOLDOWN_MS,
        ));
        const failedResult: SlotResult = {
          status: "failed",
          availableDates: [],
          checkedAt,
          message: error instanceof SlotRequestError && error.status === 429
            ? "Too many checks reached the service at once. Try this volunteer again in a moment."
            : "The live check failed twice. Open the page directly or try again.",
          reasonCode: "request_failed",
        };
        setSlotResults((current) => ({
          ...current,
          [bookingUrl]: failedResult,
        }));
        return { result: failedResult, rateLimited: error instanceof SlotRequestError && error.status === 429 };
      }
      throw error;
    }
  }

  async function startScan(pages = searchedPages, resumeFrom?: ScanReport) {
    const { queued: queue } = planLinkChecks(pages, linkHealthRef.current);
    if (!pages.length) return;
    setShowScanControls(false);
    setResultsExpired(false);
    if (!resumeFrom) setFilter("best");
    const baseCompletedUrls = resumeFrom?.completedUrls ?? [];
    const startedAt = resumeFrom?.startedAt ?? new Date().toISOString();
    const scopeUrls = resumeFrom?.urls ?? queue.map((page) => page.bookingUrl);
    const scope = resumeFrom?.scope ?? (
      scanMode === "name" && query.trim()
        ? `${queue.length} volunteer${queue.length === 1 ? "" : "s"} matching “${query.trim()}”`
        : queue.length === bookingPages.length
          ? `all ${queue.length} volunteer calendars`
          : `${queue.length} selected volunteer calendars`
    );

    if (!queue.length) {
      setScan({
        state: "complete",
        speed: resumeFrom?.speed ?? "fast",
        completed: 0,
        completedUrls: baseCompletedUrls,
        total: 0,
        urls: scopeUrls,
        startedAt,
        finishedAt: new Date().toISOString(),
        scope,
      });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    setScan({
      state: "running",
      speed: resumeFrom?.speed ?? "fast",
      completed: 0,
      completedUrls: baseCompletedUrls,
      total: queue.length,
      urls: scopeUrls,
      startedAt,
      scope,
    });

    try {
      const summary = await runProgressiveScan({
        items: queue,
        concurrency: DIRECT_HTTP_SCAN_CONCURRENCY,
        minimumConcurrency: 3,
        signal: controller.signal,
        run: (page, signal) => checkTutor(page.bookingUrl, signal, runId),
        isRateLimited: (outcome) => Boolean(outcome?.rateLimited),
        isTemporaryFailure: (outcome) => Boolean(
          outcome
          && (outcome.result.status === "unknown" || outcome.result.status === "failed")
          && outcome.result.reasonCode === "request_failed"
        ),
        onProgress: (progress) => {
          if (runId !== runIdRef.current) return;
          setScan((current) => current ? {
            ...current,
            completed: progress.completed,
            total: progress.total,
            completedUrls: [...new Set([
              ...baseCompletedUrls,
              ...progress.completedItems.map((page) => page.bookingUrl),
            ])],
          } : current);
        },
        onReducedSpeed: () => {
          setScan((current) => current ? { ...current, speed: "reduced" } : current);
        },
      });
      if (runId === runIdRef.current) {
        setScan((current) => current ? {
          ...current,
          state: summary.stopped ? "stopped" : "complete",
          completed: summary.completed,
          finishedAt: new Date().toISOString(),
        } : current);
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
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
    controllerRef.current?.abort();
    controllerRef.current = null;
    runIdRef.current += 1;
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

  function openScanControls() {
    if (scan?.state === "running") stopScan();
    setShowScanControls(true);
    window.requestAnimationFrame(() => document.querySelector("#session-finder")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function openAllScanControls() {
    setScanMode("all");
    setQuery("");
    openScanControls();
  }

  const recommendedResultFilter: ResultFilter = scanCounts.thisWeek
    ? "this_week"
    : scanCounts.nextWeek
      ? "next_week"
      : "later";

  function renderCard(booking: BookingPage) {
    const result = slotResults[booking.bookingUrl];
    if (result?.status !== "available") return null;
    const availableDates = datesInUserTime(result);
    const earliest = earliestAvailableTime(result);
    const timeCount = countAvailableTimes(result);
    const resultMessage = `${timeCount} open time${timeCount === 1 ? "" : "s"} across ${availableDates.length} date${availableDates.length === 1 ? "" : "s"}`;

    return (
      <article className="result-card available" key={booking.bookingUrl}>
        <div className="result-copy">
          <div className="result-title">
            <h4>{booking.tutor ?? "English Chat volunteer"}</h4>
            <span className="status-pill available">Open</span>
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
            <small className={`result-meta ${isCurrent(result.checkedAt) ? "" : "stale"}`}>
              Available when checked
              <span aria-hidden="true">·</span>
              {displayTime(result.checkedAt)}
              {!isCurrent(result.checkedAt) ? <><span aria-hidden="true">·</span><strong>Check again before booking</strong></> : null}
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
            Refresh result
          </button>
          <a
            className="booking-link primary"
            href={booking.bookingUrl}
            rel="noreferrer"
            target="_blank"
          >
            Choose a time on Google
            <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
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
            <a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Prepare <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
            <a className="nav-primary" href="#session-finder">Check availability</a>
          </nav>
        </div>
      </header>

      <main className="app-shell" id="top">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">BYU-Pathway English Chat</p>
            <h1 id="page-title">Find an available English Chat session.</h1>
            <p className="lede">Search live volunteer calendars and choose your appointment on Google.</p>
            <a className="hero-help-link" href="#how-it-works">New to English Chat? See how it works <span aria-hidden="true">↓</span></a>
          </div>

          <aside className="quick-finder" id="session-finder" aria-labelledby="finder-title">
            <div className="quick-finder-heading">
              <div>
                <p className="eyebrow">Live availability</p>
                <h2 id="finder-title">Find a session</h2>
              </div>
              {hasSavedScanState && scan?.state !== "running" && (!scan || showScanControls) ? (
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
                <div><strong>Availability may have changed</strong><span>These results are still here for reference. Check again before booking.</span></div>
                <button className="secondary-button" disabled={!bookingPages.length} onClick={requestScan} type="button">Check again</button>
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
                  <span>{scan.speed === "reduced" ? "Reduced scan speed for reliability" : "Fast scan enabled"}</span>
                  <button className="stop-button" onClick={stopScan} type="button">Stop scan</button>
                </div>
              </div>
            ) : scan && !showScanControls ? (
              <div
                className={`finder-outcome ${scan.state}${scan.state === "complete" && scanCounts.available === 0 && scanCounts.none === 0 ? " unreliable" : ""}`}
                ref={outcomeRef}
                tabIndex={-1}
              >
                {scan.state === "stopped" ? (
                  <>
                    <div className="outcome-announcement" role="status">
                      <span className="state-label">Scan paused</span>
                      <h3>{scan.completed} of {scan.total} calendars checked</h3>
                      <p>
                        {scanCounts.available > 0
                          ? "Open sessions found so far are ready below. Continue to check the remaining calendars."
                          : "No open sessions have been found in the completed checks. Continue when you are ready."}
                      </p>
                      <small>Completed results are saved in this browser.</small>
                    </div>
                    <div className="outcome-actions">
                      {scan.completed < scan.total ? <button onClick={scanRemaining} type="button">Continue scan</button> : null}
                      <button className="quiet-button" onClick={openScanControls} type="button">New search</button>
                    </div>
                  </>
                ) : (
                  <CompletedScanOutcome
                    available={scanCounts.available}
                    checkedRange={displayCheckedRange(scanRange?.start, scanRange?.end)}
                    confirmedEmpty={scanCounts.none}
                    isStale={resultsExpired}
                    later={scanCounts.later}
                    nextWeek={scanCounts.nextWeek}
                    onCheckAgain={requestScan}
                    onFindAny={openAllScanControls}
                    onNewSearch={openScanControls}
                    onViewSessions={showRecommendedResults}
                    singleTutor={singleScannedTutor}
                    temporarilyUnavailable={scanCounts.unavailable}
                    temporaryErrors={scanCounts.unverified}
                    thisWeek={scanCounts.thisWeek}
                  />
                )}
              </div>
            ) : (
              <div className="finder-setup">
                <div className="scan-mode-options" role="group" aria-label="Choose how to find a session">
                  <button aria-pressed={scanMode === "all"} onClick={() => selectScanMode("all")} type="button">
                    <span>Any volunteer</span><small>Recommended</small>
                  </button>
                  <button aria-pressed={scanMode === "name"} onClick={() => selectScanMode("name")} type="button">
                    <span>Search by name</span><small>One volunteer</small>
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
                          : "We couldn’t find that name. Check the spelling or find any opening instead."}
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
                      ? "Find available sessions"
                      : query.trim()
                        ? searchedPages.length
                          ? `Check ${searchedPages.length === 1 ? searchedPages[0].tutor ?? "this volunteer" : `${searchedPages.length} matching volunteers`}`
                          : "No volunteer found"
                        : "Choose a volunteer"}
                </button>
              </div>
            )}

            <div className="finder-source" aria-label="Volunteer list status">
              <span className={`live-dot ${message ? "error" : ""}`} aria-hidden="true" />
              <span>
                <strong>{loading ? "Loading volunteer list" : availability ? `${bookingPages.length} volunteers listed` : "Volunteer list unavailable"}</strong>
                {availability ? <small>Updated {displayTime(availability.checkedAt)}</small> : null}
              </span>
              <button className="source-refresh" disabled={loading} onClick={() => void refresh()} type="button">{loading ? "Refreshing…" : "Refresh"}</button>
            </div>

            <details className="finder-trust">
              <summary>How availability is checked</summary>
              <p>We ask Google for each volunteer’s live appointment times. A failed check is never counted as “no openings.”</p>
              {pausedLinkCount > 0 ? (
                <p className="link-health-note">
                  {pausedLinkCount} listed calendar{pausedLinkCount === 1 ? " is" : "s are"} temporarily paused and will be checked again automatically later.
                </p>
              ) : null}
              <a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Open the official volunteer list <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>
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
                    ? `${scanCounts.available} open volunteer calendar${scanCounts.available === 1 ? "" : "s"}`
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
          </div>

          {counts.available > 0 ? (
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
                </select>
              </label>
            </>
          ) : null}

          {counts.available > 0 ? <details className="result-help">
            <summary>How to read these results</summary>
            <div>
              <p><strong>Open:</strong> Google returned at least one appointment time when this calendar was checked.</p>
              <p><strong>Book on Google:</strong> choose the exact time on the volunteer’s official appointment page.</p>
            </div>
          </details> : null}

          {counts.available > 0 ? <div className="results-heading">
            <div><p className="eyebrow">Results</p><h3>{filter === "best" ? "Best available choices" : FILTERS.find((item) => item.value === filter)?.label}</h3></div>
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
          </div>
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
          <nav aria-label="Helpful links"><a href={OFFICIAL_SCHEDULE} rel="noreferrer" target="_blank">Official schedule <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a><a href={PREPARE_PAGE} rel="noreferrer" target="_blank">Prepare for your session <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></nav>
          <p className="footer-guidance">Availability is checked from Google Calendar. Confirm and book the exact time on Google.</p>
        </footer>
      </main>
    </>
  );
}
