"use client";

import { useCallback, useEffect, useState } from "react";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };
type SlotResult = { status: "available" | "none_in_view" | "unknown"; dates: string[]; message: string };

function displayTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not checked yet";
}

export function AvailabilityBoard() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingUrl, setCheckingUrl] = useState<string | null>(null);
  const [slotResults, setSlotResults] = useState<Record<string, SlotResult>>({});

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

  async function checkTutor(bookingUrl: string) {
    setCheckingUrl(bookingUrl);
    try {
      const response = await fetch("/api/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingUrl }) });
      const result = (await response.json()) as SlotResult & { message?: string };
      setSlotResults((current) => ({ ...current, [bookingUrl]: response.ok ? result : { status: "unknown", dates: [], message: result.message ?? "Unable to check this booking page." } }));
    } finally {
      setCheckingUrl(null);
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
          <p className="signal-number">{availability?.bookingPages.length ?? "–"}</p>
          <p className="signal-label">current tutor booking pages</p>
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

      <p className="manual-notice">Use “Check availability” for a live Google Calendar scan of one tutor. Results are not saved, and the booking page remains the final source for the exact time.</p>

      <section className="panel sessions-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Current booking pages</p>
            <h2>Choose a tutor</h2>
          </div>
          <span>{availability?.bookingPages.length ?? 0} shown</span>
        </div>
        <div className="session-list">
          {availability?.bookingPages.map((booking) => (
            <div className="session-row" key={booking.bookingUrl}>
              <span>{booking.tutor ?? "English Chat tutor"}</span>
              <span className="slot-actions"><button disabled={checkingUrl === booking.bookingUrl} onClick={() => void checkTutor(booking.bookingUrl)} type="button">{checkingUrl === booking.bookingUrl ? "Checking…" : "Check availability"}</button><a href={booking.bookingUrl} rel="noreferrer" target="_blank">Book ↗</a></span>
              {slotResults[booking.bookingUrl] ? <small className={`slot-result ${slotResults[booking.bookingUrl].status}`}>{slotResults[booking.bookingUrl].message}{slotResults[booking.bookingUrl].dates.length ? ` ${slotResults[booking.bookingUrl].dates.join(", ")}` : ""}</small> : null}
            </div>
          ))}
          {!loading && availability?.bookingPages.length === 0 ? <p className="empty-state">The scheduling page did not list any booking pages right now. Refresh later.</p> : null}
        </div>
      </section>
    </main>
  );
}
