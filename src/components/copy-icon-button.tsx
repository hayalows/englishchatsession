"use client";

import { useEffect, useState } from "react";

import styles from "./copy-icon-button.module.css";

type CopyState = "idle" | "copied" | "error";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy was not confirmed.");
}

export function CopyIconButton({
  calendarName,
  bookingUrl,
  showLabel = false,
}: { calendarName: string; bookingUrl: string; showLabel?: boolean }) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 1_800);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function handleCopy() {
    try {
      await copyText(bookingUrl);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  const label = state === "copied"
    ? "Calendar link copied"
    : state === "error"
      ? "Could not copy the calendar link. Try again."
      : `Copy ${calendarName}’s calendar link`;
  const visibleLabel = state === "copied" ? "Copied" : state === "error" ? "Try again" : "Copy calendar link";

  return (
    <button
      aria-label={label}
      className={`${styles.button}${showLabel ? ` ${styles.withLabel}` : ""}${state === "copied" ? ` ${styles.success}` : ""}`}
      onClick={() => void handleCopy()}
      title={label}
      type="button"
    >
      {state === "copied" ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <path d="m5 12 4 4L19 6" />
        </svg>
      ) : state === "error" ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
          <rect height="12" rx="2" width="12" x="8" y="8" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      )}
      {showLabel ? <span aria-hidden="true">{visibleLabel}</span> : null}
      <span className="sr-only" aria-live="polite">{state === "copied" ? "Calendar link copied" : state === "error" ? "Could not copy the calendar link. Try again." : ""}</span>
    </button>
  );
}
