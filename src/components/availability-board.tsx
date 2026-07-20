"use client";

import { useCallback, useEffect, useState } from "react";

type BookingPage = { tutor: string | null; bookingUrl: string };
type Availability = { checkedAt: string; bookingPages: BookingPage[] };

function displayTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not checked yet";
}

export function AvailabilityBoard() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

      <p className="manual-notice">A listed page is not a guaranteed open time. Google Calendar exposes current slots inside each booking page, so open a page and choose an available date and time there.</p>

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
            <a className="session-row" href={booking.bookingUrl} key={booking.bookingUrl} rel="noreferrer" target="_blank">
              <span>{booking.tutor ?? "English Chat tutor"}</span>
              <small>Check current times ↗</small>
            </a>
          ))}
          {!loading && availability?.bookingPages.length === 0 ? <p className="empty-state">The scheduling page did not list any booking pages right now. Refresh later.</p> : null}
        </div>
      </section>
    </main>
  );
}
