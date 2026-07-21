"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };
type TutorCheckStatus = "not_checked" | "checking" | "available" | "none_in_view" | "unknown" | "failed";
type SlotResult = { status: TutorCheckStatus; availableDates?: string[]; checkedAt?: string; checkedRange?: { description?: string }; message?: string };
const STORAGE_KEY = "english-chat-booking-results:v1";
const BROWSER_SCAN_CONCURRENCY = 3;

function displayTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not checked yet";
}

export function AvailabilityBoard() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingUrl, setCheckingUrl] = useState<string | null>(null);
  const [slotResults, setSlotResults] = useState<Record<string, SlotResult>>({});
  const [query, setQuery] = useState("");
  const [scanProgress, setScanProgress] = useState<{ completed: number; total: number } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/availability", { cache: "no-store" });
      const payload = (await response.json()) as Availability & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Unable to read the scheduling page.");
      setAvailability(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to read the scheduling page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); if (saved.results) setSlotResults(saved.results); } catch { /* storage is optional */ } }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ results: slotResults })); } catch { /* storage is optional */ } }, [slotResults]);

  async function checkTutor(bookingUrl: string, signal?: AbortSignal) {
    setCheckingUrl(bookingUrl);
    try {
      const response = await fetch("/api/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingUrl }), signal });
      const result = (await response.json()) as SlotResult & { message?: string };
      setSlotResults((current) => ({ ...current, [bookingUrl]: response.ok ? result : { status: "failed", message: "The booking page could not be checked right now." } }));
    } catch (error) {
      if ((error as Error).name !== "AbortError") setSlotResults((current) => ({ ...current, [bookingUrl]: { status: "failed", message: "The booking page could not be checked right now." } }));
    } finally {
      setCheckingUrl(null);
    }
  }

  const bookingPages = availability?.bookingPages ?? [];
  const filteredPages = bookingPages.filter((booking) => (booking.tutor ?? "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const availableCount = Object.values(slotResults).filter((result) => result.status === "available").length;

  async function scanAll() {
    const controller = new AbortController(); controllerRef.current = controller; setScanProgress({ completed: 0, total: filteredPages.length });
    let nextIndex = 0;
    let completed = 0;
    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = nextIndex++;
        if (index >= filteredPages.length) return;
        const bookingUrl = filteredPages[index].bookingUrl;
        setSlotResults((current) => ({ ...current, [bookingUrl]: { status: "checking" } }));
        await checkTutor(bookingUrl, controller.signal);
        if (controller.signal.aborted) return;
        completed += 1;
        setScanProgress({ completed, total: filteredPages.length });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(BROWSER_SCAN_CONCURRENCY, filteredPages.length) }, worker));
    } finally {
      setScanProgress(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">BYU-Pathway English Chat</p>
          <h1>Find a booking page</h1>
        </div>
      </header>

      <section className="signal-panel">
        <div>
          <p className="eyebrow">Live source check</p>
          <p className="signal-number">{availableCount || availability?.bookingPages.length || "–"}</p>
          <p className="signal-label">{availableCount ? "tutors with dates found" : "current tutor booking pages"}</p>
        </div>
        <div className="signal-detail">
          <p>Checked from the scheduling page</p>
          <strong>{displayTime(availability?.checkedAt ?? null)}</strong>
          <span>Nothing is saved or sent anywhere.</span>
        </div>
        <div className="check-action">
          <button disabled={loading} onClick={() => void refresh()} type="button">{loading ? "Checking…" : "Refresh current pages"}</button>
          {message ? <small aria-live="polite">{message}</small> : null}
        </div>
      </section>

      <p className="manual-notice">Each check opens Google Calendar live. It reads the calendar’s currently rendered range, which Google controls and can vary by tutor; it does not guess future availability. Results disappear when you refresh.</p>

      <section className="panel sessions-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Current booking pages</p>
            <h2>Choose a tutor</h2>
          </div>
          <span>{filteredPages.length} of {bookingPages.length} shown</span>
        </div>
        <div className="finder-controls">
          <label className="search-field"><span>Find a tutor</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Type a name" type="search" value={query} /></label>
          <button disabled={Boolean(scanProgress) || filteredPages.length === 0} onClick={() => void scanAll()} type="button">{scanProgress ? `Checking ${scanProgress.completed}/${scanProgress.total}` : `Check all ${filteredPages.length}`}</button>{scanProgress ? <button onClick={() => controllerRef.current?.abort()} type="button">Stop scan</button> : null}
        </div>
        {scanProgress ? <p className="scan-note" aria-live="polite">Checking one tutor at a time for reliability. You can leave this tab open while the scan runs.</p> : null}
        <div className="session-list">
          {filteredPages.map((booking) => (
            <div className="session-row" key={booking.bookingUrl}>
              <span>{booking.tutor ?? "English Chat tutor"}</span>
              <span className="slot-actions"><button disabled={checkingUrl === booking.bookingUrl} onClick={() => void checkTutor(booking.bookingUrl)} type="button">{checkingUrl === booking.bookingUrl ? "Checking…" : "Check availability"}</button><a href={booking.bookingUrl} rel="noreferrer" target="_blank">Book ↗</a></span>
              {slotResults[booking.bookingUrl] ? <small className={`slot-result ${slotResults[booking.bookingUrl]?.status ?? "not_checked"}`}>{slotResults[booking.bookingUrl]?.message}{slotResults[booking.bookingUrl]?.availableDates?.length ? ` ${slotResults[booking.bookingUrl]?.availableDates?.join(", ")}` : ""}</small> : <small className="slot-result not_checked">Not checked</small>}
            </div>
          ))}
          {!loading && filteredPages.length === 0 ? <p className="empty-state">No tutor matches that search. Clear it or refresh the source list.</p> : null}
        </div>
      </section>
    </main>
  );
}
