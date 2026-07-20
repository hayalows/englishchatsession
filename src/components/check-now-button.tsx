"use client";

import { useState } from "react";

export function CheckNowButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function checkNow() {
    setRunning(true);
    setMessage(null);
    const response = await fetch("/api/monitor/run", { method: "POST" });
    const payload = (await response.json()) as { message?: string; status?: string; sessionsFound?: number; changesFound?: number };
    setRunning(false);
    setMessage(response.ok ? `${payload.status}: ${payload.sessionsFound ?? 0} links, ${payload.changesFound ?? 0} changes.` : payload.message ?? "The monitor could not start.");
  }

  return (
    <div className="check-action">
      <button disabled={running} onClick={checkNow} type="button">{running ? "Checking appointments…" : "Check Available Appointments"}</button>
      {message ? <small aria-live="polite">{message}</small> : null}
    </div>
  );
}
