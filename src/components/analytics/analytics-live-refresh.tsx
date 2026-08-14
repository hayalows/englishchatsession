"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import styles from "./analytics-live-refresh.module.css";

const REFRESH_INTERVAL_MS = 60_000;

export function AnalyticsLiveRefresh({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        startTransition(() => router.refresh());
      }
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [router, startTransition]);

  return (
    <div className={`${styles.controls} ${compact ? styles.compact : ""}`}>
      <span aria-live="polite">{isPending ? "Refreshing…" : compact ? "Auto 1 min" : "Updates automatically every minute"}</span>
      <button disabled={isPending} onClick={() => startTransition(() => router.refresh())} type="button">
        {isPending ? "Refreshing" : compact ? "Refresh" : "Refresh now"}
      </button>
    </div>
  );
}
